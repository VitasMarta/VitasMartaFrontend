"use client";

import { useEffect, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { z } from "zod";
import { ApiError } from "@/core/api/errorNormalizer";
import { api } from "@/core/api/gatewayClient";
import { routes } from "@/core/api/routes";
import { BFF_BASE } from "@/core/api/transport";
import { ROL_HOME } from "@/core/auth/rbacGuard";
import { fetchPreferencias } from "@/core/auth/preferences";
import { completeMfa, login } from "@/core/auth/session";
import { useSessionStore } from "@/core/auth/sessionStore";
import { Link, usePathname, useRouter } from "@/core/i18n/navigation";
import type { Locale } from "@/core/i18n/routing";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { CheckboxField, ErrorSummary, TextField } from "@/shared/ui/forms";
import { Icon } from "@/shared/ui/Icon";
import { Container } from "@/shared/ui/layout";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { PASSWORD_RULES, formValues, isStrongPassword, validate, type FieldErrors } from "@/shared/validate";

/** Columna centrada y angosta (inicio de sesión, registro, verificación, recuperación). */
function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  const t = useTranslations("auth.shell");
  useDocumentTitle(title);
  return (
    <Container className="py-12">
      <div className="mx-auto max-w-md">
        <h1 className="!text-3xl">{title}</h1>
        {description && <p className="mt-3 text-ink/90">{description}</p>}
        <div className="mt-6">{children}</div>
        <p className="meta mt-10 border-t border-line pt-6 text-center text-ink/80">{t("legal")}</p>
      </div>
    </Container>
  );
}

/** Solo rutas internas relativas: evita open-redirect vía `?volver=`. */
const safeReturn = (value: string | null): string | null => (value && value.startsWith("/") && !value.startsWith("//") ? value : null);

// ── Login + MFA ─────────────────────────────────────────────────────────────────────────────────
export function LoginView() {
  const t = useTranslations("auth.login");
  const tc = useTranslations("common");
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const status = useSessionStore((s) => s.status);
  const [step, setStep] = useState<"credentials" | "mfa">("credentials");
  const [mfaToken, setMfaToken] = useState("");
  const [enrollmentSecret, setEnrollmentSecret] = useState<string | null>(null);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [correoIntento, setCorreoIntento] = useState("");
  const [busy, setBusy] = useState(false);
  const oauth = params.get("oauth");
  const finishing = useRef(false);
  void pathname;

  const finish = async () => {
    if (finishing.current) return; // evita doble redirección (efecto + envío del formulario)
    finishing.current = true;
    const user = useSessionStore.getState().user;
    const target = safeReturn(params.get("volver")) ?? (user ? ROL_HOME[user.rol] : "/");
    // Adopta el idioma preferido del titular (M7) si difiere del actual.
    const preferred = await fetchPreferencias().then((p) => p.idioma_preferido).catch(() => undefined);
    router.replace(target, preferred ? { locale: preferred as Locale } : undefined);
  };

  useEffect(() => {
    if (status === "authenticated" && !busy && step === "credentials") void finish();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const onCredentials = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, errors: fieldErrors } = validate(
      z.object({ correo: z.string().email(t("errors.email")), password: z.string().min(1, t("errors.password")) }),
      formValues(e.currentTarget),
    );
    setErrors(fieldErrors ?? {});
    setFailure(null);
    if (!data) return;
    setCorreoIntento(data.correo);
    setBusy(true);
    try {
      const result = await login(data.correo, data.password);
      if (result.kind === "mfa") {
        setMfaToken(result.mfaToken);
        setEnrollmentSecret(result.enrollmentSecret ?? null);
        setStep("mfa");
      } else await finish();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const onMfa = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, errors: fieldErrors } = validate(z.object({ codigo_totp: z.string().regex(/^\d{6}$/, t("errors.totp")) }), formValues(e.currentTarget));
    setErrors(fieldErrors ?? {});
    setFailure(null);
    if (!data) return;
    setBusy(true);
    try {
      await completeMfa(data.codigo_totp, mfaToken);
      await finish();
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const locked = failure instanceof ApiError && failure.status === 423;
  const sinVerificar = failure instanceof ApiError && failure.codigo === "CUENTA_NO_VERIFICADA";

  return (
    <AuthShell title={step === "mfa" ? t("mfaTitle") : t("title")} description={step === "mfa" ? t("mfaDescription") : t("description")}>
      {oauth && <p role="status" className="mb-6 border-l-4 border-ink pl-3">{t("oauthNotice", { provider: oauth })}</p>}
      {step === "credentials" ? (
        <form onSubmit={onCredentials} noValidate className="space-y-6">
          <ErrorSummary errors={errors} title={tc("errorSummary")} />
          <TextField label={t("email")} name="correo" type="email" autoComplete="username" required error={errors.correo} />
          <TextField label={t("password")} name="password" type="password" autoComplete="current-password" required error={errors.password} />
          {failure != null && (locked ? <StatusBlock kind="error" title={t("locked")} /> : <ErrorNotice error={failure} referenceLabel={tc("reference")} />)}
          {sinVerificar && <ReenviarVerificacion correo={correoIntento} />}
          <Button type="submit" loading={busy} className="w-full !min-h-12 text-lg">
            {busy ? t("submitting") : t("submit")}
          </Button>

          <div className="flex items-center gap-3" aria-hidden="true">
            <span className="h-px flex-1 bg-line" />
            <span className="text-sm text-ink/80">{t("or")}</span>
            <span className="h-px flex-1 bg-line" />
          </div>
          <p className="sr-only">{t("or")}</p>
          <div className="flex justify-center gap-4">
            {(["google", "facebook"] as const).map((p) => (
              <a key={p} href={`${BFF_BASE}${routes.identidad.oauthInicio(p)}`} className="card card-hover inline-flex min-h-16 min-w-24 flex-col items-center justify-center gap-1 px-4 font-semibold">
                <span aria-hidden="true" className="text-2xl font-bold text-action">{p === "google" ? "G" : "f"}</span>
                <span className="text-sm">{t(`oauth.${p}`)}</span>
              </a>
            ))}
          </div>
          <p className="text-center">
            <Link href="/recuperar" className="text-link font-semibold">{t("forgot")}</Link>
          </p>
          <p className="text-center">
            {t("noAccount")}{" "}
            <Link href="/registro" className="text-link font-semibold">{t("createAccount")}</Link>
          </p>
        </form>
      ) : (
        <form onSubmit={onMfa} noValidate className="space-y-6">
          <ErrorSummary errors={errors} title={tc("errorSummary")} />
          {enrollmentSecret && (
            <section aria-labelledby="mfa-enrolamiento" className="border-l-4 border-ink pl-4">
              <h2 id="mfa-enrolamiento" className="text-lg font-semibold">{t("enrollTitle")}</h2>
              <p className="mt-1">{t("enrollBody")}</p>
              <p className="mt-3 text-sm font-semibold">{t("enrollSecret")}</p>
              <code className="mt-1 block break-all font-mono text-lg text-ink tracking-wider select-all" data-testid="mfa-secreto">
                {enrollmentSecret}
              </code>
              <p className="mt-2 text-sm text-ink/80">{t("enrollWarning")}</p>
            </section>
          )}
          <TextField label={t("totp")} name="codigo_totp" inputMode="numeric" autoComplete="one-time-code" maxLength={6} pattern="\d{6}" required error={errors.codigo_totp} hint={t("totpHint")} className="max-w-60" />
          {failure != null && <ErrorNotice error={failure} referenceLabel={tc("reference")} />}
          <div className="flex gap-3">
            <Button type="submit" loading={busy}>{t("verify")}</Button>
            <Button variant="ghost" onClick={() => { setStep("credentials"); setFailure(null); setEnrollmentSecret(null); }}>{tc("back")}</Button>
          </div>
        </form>
      )}
    </AuthShell>
  );
}

// ── Registro (consentimientos granulares, FR-707) ───────────────────────────────────────────────
export function RegisterView() {
  const t = useTranslations("auth.register");
  const tc = useTranslations("common");
  const [password, setPassword] = useState("");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState<string | null>(null);

  const schema = z
    .object({
      correo: z.string().email(t("errors.email")),
      password: z.string().refine(isStrongPassword, t("errors.password")),
      confirmacion: z.string(),
      tratamiento: z.literal(true, { error: t("errors.treatment") }),
      comercial: z.boolean().optional(),
      perfilado: z.boolean().optional(),
    })
    .refine((v) => v.password === v.confirmacion, { path: ["confirmacion"], message: t("errors.mismatch") });

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, errors: fieldErrors } = validate(schema, formValues(e.currentTarget));
    setErrors(fieldErrors ?? {});
    setFailure(null);
    if (!data) return;
    setBusy(true);
    try {
      // M7 (`ConsentimientoRequest`): { finalidad, otorgado }. La versión de la política la fija M7.
      await api.post(routes.identidad.cuentas, {
        auth: false,
        body: {
          correo: data.correo,
          password: data.password,
          // M7 solo admite autorregistro TURISTA (S1): el rol PRESTADOR lo asigna la administración
          // al aprobar la solicitud radicada en «Ser prestador» (M4).
          tipo_usuario: "TURISTA",
          consentimientos: [
            { finalidad: "TRATAMIENTO", otorgado: true },
            { finalidad: "COMERCIAL", otorgado: !!data.comercial },
            { finalidad: "PERFILADO", otorgado: !!data.perfilado },
          ],
        },
      });
      setDone(data.correo);
    } catch (error) {
      if (error instanceof ApiError) setErrors(error.fieldErrors());
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <AuthShell title={t("doneTitle")}>
        <p className="flex items-start gap-2 text-lg"><Icon name="check" className="mt-1 text-emerald-ink" size={24} />{t("doneBody")}</p>
        <ReenviarVerificacion correo={done} />
        <Link href="/login" className="text-link mt-6 inline-block font-semibold">{t("goLogin")}</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("title")} description={t("description")}>
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <ErrorSummary errors={errors} title={tc("errorSummary")} />
        <TextField label={t("email")} name="correo" type="email" autoComplete="email" required error={errors.correo} />
        <p className="border-l-4 border-ink pl-3 text-sm">{t("providerNote")}</p>
        <div>
          <TextField label={t("password")} name="password" type="password" autoComplete="new-password" required value={password} onChange={(e) => setPassword(e.target.value)} error={errors.password} hint={t("passwordHint")} />
          <ul className="mt-2 grid gap-1 text-sm sm:grid-cols-2" aria-label={t("passwordHint")}>
            {(Object.keys(PASSWORD_RULES) as (keyof typeof PASSWORD_RULES)[]).map((rule) => (
              <li key={rule} className={PASSWORD_RULES[rule](password) ? "font-semibold text-emerald-ink" : "text-ink/80"}>
                {PASSWORD_RULES[rule](password) ? "✓ " : "○ "}
                {t(`rules.${rule}`)}
              </li>
            ))}
          </ul>
        </div>
        <TextField label={t("confirm")} name="confirmacion" type="password" autoComplete="new-password" required error={errors.confirmacion} />

        <fieldset className="space-y-4 border-t-2 border-ink pt-4">
          <legend className="pr-3 text-lg font-semibold">{t("consents")}</legend>
          <CheckboxField label={t("consentTreatment")} name="tratamiento" required error={errors.tratamiento} />
          <CheckboxField label={t("consentCommercial")} name="comercial" hint={t("optional")} />
          <CheckboxField label={t("consentProfiling")} name="perfilado" hint={t("profilingHint")} />
        </fieldset>

        {failure != null && !Object.keys(errors).length && <ErrorNotice error={failure} referenceLabel={tc("reference")} />}
        <Button type="submit" loading={busy} className="w-full !min-h-12 text-lg">{busy ? t("submitting") : t("submit")}</Button>
        <p>
          {t("haveAccount")} <Link href="/login" className="text-link font-semibold">{t("goLogin")}</Link>
        </p>
      </form>
    </AuthShell>
  );
}

// ── Reenvío del correo de verificación (M7 `POST /cuentas/reenvio-verificacion`) ────────────────
const ESPERA_REENVIO_S = 60;

/**
 * Pide a M7 un enlace nuevo (el anterior queda inválido). La respuesta es siempre neutra
 * (anti-enumeración), así que se muestra el mismo aviso exista o no la cuenta. Tras cada envío
 * el botón espera {@link ESPERA_REENVIO_S} s para no llenar la bandeja ni la cola de M10.
 * Sin `correo` se pide el correo en un campo.
 */
export function ReenviarVerificacion({ correo }: { correo?: string }) {
  const t = useTranslations("auth.resend");
  const tc = useTranslations("common");
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [espera, setEspera] = useState(0);
  const [error, setError] = useState<string | undefined>();
  const [failure, setFailure] = useState<unknown>(null);

  useEffect(() => {
    if (espera <= 0) return;
    const id = setTimeout(() => setEspera((s) => s - 1), 1000);
    return () => clearTimeout(id);
  }, [espera]);

  const enviar = async (destino: string) => {
    setFailure(null);
    setBusy(true);
    try {
      await api.post(routes.identidad.reenvioVerificacion, { auth: false, body: { correo: destino } });
      setSent(true);
      setEspera(ESPERA_REENVIO_S);
    } catch (e) {
      // Igual que la recuperación: solo los fallos de red/servidor se informan.
      if (e instanceof ApiError && e.status !== 0 && e.status < 500) {
        setSent(true);
        setEspera(ESPERA_REENVIO_S);
      } else setFailure(e);
    } finally {
      setBusy(false);
    }
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const destino = correo ?? String(formValues(e.currentTarget).correo ?? "").trim();
    if (!z.string().email().safeParse(destino).success) return setError(t("invalidEmail"));
    setError(undefined);
    void enviar(destino);
  };

  return (
    <form onSubmit={onSubmit} noValidate className="mt-6 space-y-4 rounded-lg bg-page px-4 py-4" aria-live="polite">
      <p className="text-sm text-ink/85">{correo ? t("questionWithEmail", { correo }) : t("question")}</p>
      {!correo && <TextField label={t("email")} name="correo" type="email" autoComplete="email" required error={error} />}
      {sent && <p role="status" className="border-l-4 border-emerald pl-3 text-sm">{t("sent")}</p>}
      {failure != null && <ErrorNotice error={failure} referenceLabel={tc("reference")} />}
      <Button type="submit" variant="secondary" loading={busy} disabled={espera > 0}>
        {espera > 0 ? t("wait", { segundos: espera }) : sent ? t("again") : t("submit")}
      </Button>
    </form>
  );
}

// ── Verificación de correo (enlace con ?token=) ─────────────────────────────────────────────────
export function VerifyView() {
  const t = useTranslations("auth.verify");
  const tc = useTranslations("common");
  const token = useSearchParams().get("token");
  const [state, setState] = useState<"loading" | "ok" | "error">(token ? "loading" : "error");
  const [failure, setFailure] = useState<unknown>(token ? null : new Error(t("missingToken")));
  const sent = useRef(false);

  useEffect(() => {
    if (!token || sent.current) return;
    sent.current = true;
    api
      .post(routes.identidad.verificacion, { auth: false, body: { token } })
      .then(() => setState("ok"))
      .catch((error) => {
        setFailure(error);
        setState("error");
      });
  }, [token]);

  return (
    <AuthShell title={t("title")}>
      <div aria-live="polite">
        {state === "loading" && <StatusBlock kind="loading" title={t("verifying")} />}
        {state === "ok" && (
          <>
            <p className="flex items-center gap-2 text-lg"><Icon name="check" className="text-emerald-ink" size={24} />{t("ok")}</p>
            <Link href="/login" className="text-link mt-4 inline-block font-semibold">{t("goLogin")}</Link>
          </>
        )}
        {state === "error" && (
          <>
            <ErrorNotice error={failure} referenceLabel={tc("reference")} />
            <ReenviarVerificacion />
          </>
        )}
      </div>
    </AuthShell>
  );
}

// ── Recuperación y restablecimiento de contraseña ───────────────────────────────────────────────
export function RecoverView() {
  const t = useTranslations("auth.recover");
  const tc = useTranslations("common");
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [sent, setSent] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, errors: fieldErrors } = validate(z.object({ correo: z.string().email(t("errors.email")) }), formValues(e.currentTarget));
    setErrors(fieldErrors ?? {});
    if (!data) return;
    setBusy(true);
    try {
      await api.post(routes.identidad.recuperacion, { auth: false, body: { correo: data.correo } });
      setSent(true);
    } catch (error) {
      // Anti-enumeración: solo los fallos de red se informan; el resto responde igual que el éxito.
      if (error instanceof ApiError && error.status !== 0 && error.status < 500) setSent(true);
      else setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("title")} description={t("description")}>
      {sent ? (
        <p role="status" className="border-l-4 border-emerald pl-3 text-lg">{t("neutral")}</p>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <ErrorSummary errors={errors} title={tc("errorSummary")} />
          <TextField label={t("email")} name="correo" type="email" autoComplete="email" required error={errors.correo} />
          {failure != null && <ErrorNotice error={failure} referenceLabel={tc("reference")} />}
          <Button type="submit" loading={busy}>{t("submit")}</Button>
        </form>
      )}
      <p className="mt-6"><Link href="/login" className="text-link font-semibold">{t("back")}</Link></p>
    </AuthShell>
  );
}

export function ResetView() {
  const t = useTranslations("auth.reset");
  const tr = useTranslations("auth.register");
  const tc = useTranslations("common");
  const token = useSearchParams().get("token") ?? "";
  const [errors, setErrors] = useState<FieldErrors>({});
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [failure, setFailure] = useState<unknown>(null);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const schema = z
      .object({ nueva_password: z.string().refine(isStrongPassword, tr("errors.password")), confirmacion: z.string() })
      .refine((v) => v.nueva_password === v.confirmacion, { path: ["confirmacion"], message: tr("errors.mismatch") });
    const { data, errors: fieldErrors } = validate(schema, formValues(e.currentTarget));
    setErrors(fieldErrors ?? {});
    setFailure(null);
    if (!data) return;
    setBusy(true);
    try {
      // M7 (`RestablecimientoRequest`): { token, password }.
      await api.post(routes.identidad.restablecimiento, { auth: false, body: { token, password: data.nueva_password } });
      setDone(true);
    } catch (error) {
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  return (
    <AuthShell title={t("title")}>
      {done ? (
        <>
          <p role="status" className="border-l-4 border-emerald pl-3 text-lg">{t("done")}</p>
          <Link href="/login" className="text-link mt-4 inline-block font-semibold">{tr("goLogin")}</Link>
        </>
      ) : (
        <form onSubmit={onSubmit} noValidate className="space-y-6">
          <ErrorSummary errors={errors} title={tc("errorSummary")} />
          <TextField label={t("newPassword")} name="nueva_password" type="password" autoComplete="new-password" required error={errors.nueva_password} hint={tr("passwordHint")} />
          <TextField label={tr("confirm")} name="confirmacion" type="password" autoComplete="new-password" required error={errors.confirmacion} />
          {failure != null && <ErrorNotice error={failure} referenceLabel={tc("reference")} />}
          <Button type="submit" loading={busy}>{t("submit")}</Button>
        </form>
      )}
    </AuthShell>
  );
}
