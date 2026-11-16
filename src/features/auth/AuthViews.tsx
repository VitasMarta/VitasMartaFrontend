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
import { CheckboxField, ErrorSummary, SelectField, TextField } from "@/shared/ui/forms";
import { Icon } from "@/shared/ui/Icon";
import { Container, PageHeader } from "@/shared/ui/layout";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { PASSWORD_RULES, formValues, isStrongPassword, validate, type FieldErrors } from "@/shared/validate";

function AuthShell({ title, description, children }: { title: string; description?: string; children: ReactNode }) {
  useDocumentTitle(title);
  return (
    <>
      <PageHeader title={title} description={description} />
      <Container className="py-10">
        <div className="max-w-xl">{children}</div>
      </Container>
    </>
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

  return (
    <AuthShell title={step === "mfa" ? t("mfaTitle") : t("title")} description={step === "mfa" ? t("mfaDescription") : t("description")}>
      {oauth && <p role="status" className="mb-6 border-l-4 border-ink pl-3">{t("oauthNotice", { provider: oauth })}</p>}
      {step === "credentials" ? (
        <form onSubmit={onCredentials} noValidate className="space-y-6">
          <ErrorSummary errors={errors} title={tc("errorSummary")} />
          <TextField label={t("email")} name="correo" type="email" autoComplete="username" required error={errors.correo} />
          <TextField label={t("password")} name="password" type="password" autoComplete="current-password" required error={errors.password} />
          {failure != null && (locked ? <StatusBlock kind="error" title={t("locked")} /> : <ErrorNotice error={failure} referenceLabel={tc("reference")} />)}
          <Button type="submit" loading={busy} className="w-full sm:w-auto">
            {busy ? t("submitting") : t("submit")}
          </Button>
          <p className="text-sm">
            <Link href="/recuperar" className="text-link font-semibold">{t("forgot")}</Link>
          </p>

          <div className="border-t border-ink/15 pt-6">
            <p className="mb-3 font-semibold">{t("or")}</p>
            <div className="flex flex-wrap gap-3">
              {(["google", "facebook"] as const).map((p) => (
                <a key={p} href={`${BFF_BASE}${routes.identidad.oauthInicio(p)}`} className="inline-flex min-h-11 items-center border-2 border-ink px-5 font-semibold hover:bg-mist">
                  {t(`oauth.${p}`)}
                </a>
              ))}
            </div>
          </div>
          <p className="border-t border-ink/15 pt-6">
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
              <code className="mt-1 block break-all font-mono text-base tracking-wider select-all" data-testid="mfa-secreto">
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
  const [done, setDone] = useState(false);

  const schema = z
    .object({
      correo: z.string().email(t("errors.email")),
      password: z.string().refine(isStrongPassword, t("errors.password")),
      confirmacion: z.string(),
      tipo_usuario: z.enum(["TURISTA", "PRESTADOR"]),
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
      const version_terminos = "2026.1";
      await api.post(routes.identidad.cuentas, {
        auth: false,
        body: {
          correo: data.correo,
          password: data.password,
          tipo_usuario: data.tipo_usuario,
          consentimientos: [
            { finalidad: "TRATAMIENTO", version_terminos, aceptado: true },
            { finalidad: "COMERCIAL", version_terminos, aceptado: !!data.comercial },
            { finalidad: "PERFILADO", version_terminos, aceptado: !!data.perfilado },
          ],
        },
      });
      setDone(true);
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
        <Link href="/login" className="text-link mt-6 inline-block font-semibold">{t("goLogin")}</Link>
      </AuthShell>
    );
  }

  return (
    <AuthShell title={t("title")} description={t("description")}>
      <form onSubmit={onSubmit} noValidate className="space-y-6">
        <ErrorSummary errors={errors} title={tc("errorSummary")} />
        <TextField label={t("email")} name="correo" type="email" autoComplete="email" required error={errors.correo} />
        <SelectField label={t("userType")} name="tipo_usuario" defaultValue="TURISTA" error={errors.tipo_usuario}>
          <option value="TURISTA">{t("tourist")}</option>
          <option value="PRESTADOR">{t("provider")}</option>
        </SelectField>
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
        <Button type="submit" loading={busy}>{busy ? t("submitting") : t("submit")}</Button>
        <p>
          {t("haveAccount")} <Link href="/login" className="text-link font-semibold">{t("goLogin")}</Link>
        </p>
      </form>
    </AuthShell>
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
        {state === "error" && <ErrorNotice error={failure} referenceLabel={tc("reference")} />}
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
      await api.post(routes.identidad.restablecimiento, { auth: false, body: { token, nueva_password: data.nueva_password } });
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
