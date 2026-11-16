"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { api } from "@/core/api/gatewayClient";
import { routes } from "@/core/api/routes";
import type { ConsentimientoEstado, Finalidad, SolicitudArco } from "@/core/api/types";
import { RequireRole } from "@/core/auth/RequireRole";
import { fetchPreferencias, type Preferencias } from "@/core/auth/preferences";
import { formatDate, localized } from "@/core/format";
import { usePathname, useRouter } from "@/core/i18n/navigation";
import { LOCALES, type Locale } from "@/core/i18n/routing";
import { setApiLocale } from "@/core/api/locale";
import { useUiStore } from "@/core/store/uiStore";
import { useCategorias } from "@/features/catalogo/api";
import { saveBlob } from "@/features/reservas/api";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { ErrorSummary, SelectField, SwitchField, TextAreaField, TextField } from "@/shared/ui/forms";
import { Stepper, StatusTag } from "@/shared/ui/indicators";
import { Container, PageHeader } from "@/shared/ui/layout";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { Tabs } from "@/shared/ui/Tabs";
import { formValues, validate, type FieldErrors } from "@/shared/validate";

// ── Datos personales ────────────────────────────────────────────────────────────────────────────
function PerfilTab() {
  const t = useTranslations("perfil.profile");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["perfil"], queryFn: async () => (await api.get<Record<string, string>>(routes.identidad.perfil)).data });
  const save = useMutation({
    mutationFn: async (body: Record<string, unknown>) => api.put(routes.identidad.perfil, { body }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["perfil"] });
      useUiStore.getState().push({ tone: "success", message: t("saved") });
    },
  });
  const [errors, setErrors] = useState<FieldErrors>({});

  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const { data, errors: fe } = validate(z.object({ nombre: z.string().min(1, t("errors.required")), apellido: z.string().min(1, t("errors.required")), telefono: z.string().optional(), pais_residencia: z.string().optional() }), formValues(e.currentTarget));
    setErrors(fe ?? {});
    if (data) save.mutate({ ...q.data, ...data });
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-xl space-y-6">
      <ErrorSummary errors={errors} title={tc("errorSummary")} />
      <TextField label={t("email")} name="correo" value={q.data.correo ?? ""} readOnly hint={t("emailHint")} />
      <TextField label={t("firstName")} name="nombre" defaultValue={q.data.nombre} required error={errors.nombre} autoComplete="given-name" />
      <TextField label={t("lastName")} name="apellido" defaultValue={q.data.apellido} required error={errors.apellido} autoComplete="family-name" />
      <TextField label={t("phone")} name="telefono" defaultValue={q.data.telefono} autoComplete="tel" />
      <TextField label={t("country")} name="pais_residencia" defaultValue={q.data.pais_residencia} autoComplete="country" />
      <Button type="submit" loading={save.isPending}>{tc("save")}</Button>
    </form>
  );
}

// ── Preferencias e idioma ───────────────────────────────────────────────────────────────────────
function PreferenciasTab() {
  const t = useTranslations("perfil.preferences");
  const tc = useTranslations("common");
  const tl = useTranslations("common.locale");
  const router = useRouter();
  const pathname = usePathname();
  const q = useQuery({ queryKey: ["preferencias"], queryFn: fetchPreferencias });
  const save = useMutation({ mutationFn: async (body: Preferencias) => (await api.put<Preferencias>(routes.identidad.preferencias, { body })).data });

  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = formValues(e.currentTarget);
    const idioma = f.idioma_preferido as Locale;
    save.mutate({ ...q.data, idioma_preferido: idioma, canal_autorizado: String(f.canal_autorizado ?? ""), idioma_autorizado: idioma }, {
      onSuccess: () => {
        // Cambiar `idioma_preferido` actualiza el idioma global de la interfaz (RF-11).
        setApiLocale(idioma);
        useUiStore.getState().push({ tone: "success", message: idioma === "en-US" ? "The interface language was updated" : "El idioma de la interfaz fue actualizado" });
        router.replace(`${pathname}?seccion=preferencias`, { locale: idioma });
      },
    });
  };

  return (
    <form onSubmit={onSubmit} className="max-w-xl space-y-6">
      <SelectField label={t("language")} name="idioma_preferido" defaultValue={q.data.idioma_preferido}>
        {LOCALES.map((l) => <option key={l} value={l}>{tl(l)}</option>)}
      </SelectField>
      <SelectField label={t("channel")} name="canal_autorizado" defaultValue={String(q.data.canal_autorizado ?? "EMAIL")} hint={t("channelHint")}>
        <option value="EMAIL">{t("email")}</option>
        <option value="NINGUNO">{t("none")}</option>
      </SelectField>
      <Button type="submit" loading={save.isPending}>{tc("save")}</Button>
    </form>
  );
}

// ── Intereses turísticos (alimentan a M6) ───────────────────────────────────────────────────────
function InteresesTab() {
  const t = useTranslations("perfil.interests");
  const tc = useTranslations("common");
  const locale = useLocale();
  const categorias = useCategorias();
  const q = useQuery({ queryKey: ["intereses"], queryFn: async () => (await api.get<{ intereses: string[] }>(routes.identidad.intereses)).data.intereses });
  const [draft, setDraft] = useState<Set<string> | null>(null);
  const save = useMutation({
    mutationFn: async (list: string[]) => api.put(routes.identidad.intereses, { body: { intereses: list } }), // reemplazo atómico
    onSuccess: () => useUiStore.getState().push({ tone: "success", message: t("saved") }),
  });

  if (q.isPending || categorias.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  const current = draft ?? new Set(q.data);
  const toggle = (slug: string) => {
    const next = new Set(current);
    if (next.has(slug)) next.delete(slug);
    else next.add(slug);
    setDraft(next);
  };

  return (
    <form onSubmit={(e) => { e.preventDefault(); save.mutate([...current]); }} className="max-w-xl space-y-6">
      <fieldset>
        <legend className="mb-2 font-semibold">{t("legend")}</legend>
        <p className="mb-3 text-sm text-ink/80">{t("hint")}</p>
        <div className="grid gap-x-6 sm:grid-cols-2">
          {categorias.data?.map((c) => (
            <label key={c.slug} className="flex min-h-11 cursor-pointer items-center gap-3">
              <input type="checkbox" className="size-5 accent-ink" checked={current.has(c.slug)} onChange={() => toggle(c.slug)} />
              {localized(c.nombre, locale)}
            </label>
          ))}
        </div>
      </fieldset>
      <Button type="submit" loading={save.isPending}>{tc("save")}</Button>
    </form>
  );
}

// ── Consentimientos (opt-out del perfilado con IA — REG-03-4) ───────────────────────────────────
/** M7 (`ConsentimientosResponse`): `{ vigente: { FINALIDAD: { otorgado, version_politica, fecha_hora } }, historial }`. */
interface ConsentimientosM7 {
  vigente?: Record<string, { finalidad?: Finalidad; otorgado: boolean; version_politica?: string; fecha_hora?: string }>;
}

const FINALIDADES: Finalidad[] = ["TRATAMIENTO", "COMERCIAL", "PERFILADO"];

/** Estado vigente por finalidad (las que no tienen registro se muestran como no otorgadas). */
export function consentimientosVigentes(data: ConsentimientosM7 | ConsentimientoEstado[]): ConsentimientoEstado[] {
  if (Array.isArray(data)) return data;
  const vigente = data.vigente ?? {};
  return FINALIDADES.map((finalidad) => {
    const c = vigente[finalidad];
    return { finalidad, otorgado: !!c?.otorgado, version_terminos: c?.version_politica, fecha: c?.fecha_hora };
  });
}

function ConsentimientosTab() {
  const t = useTranslations("perfil.consents");
  const tc = useTranslations("common");
  const queryClient = useQueryClient();
  // Respuesta inmediata del interruptor; se descarta al llegar la respuesta del servidor.
  const [pending, setPending] = useState<Partial<Record<Finalidad, boolean>>>({});
  const q = useQuery({
    queryKey: ["consentimientos"],
    queryFn: async () => consentimientosVigentes((await api.get<ConsentimientosM7 | ConsentimientoEstado[]>(routes.identidad.consentimientos)).data),
  });
  const toggle = useMutation({
    mutationFn: async ({ finalidad, otorgado }: { finalidad: Finalidad; otorgado: boolean }) => api.put(routes.identidad.consentimiento(finalidad), { body: { otorgado } }),
    onSettled: (_d, _e, v) => setPending((p) => ({ ...p, [v.finalidad]: undefined })),
    onSuccess: (_d, v) => {
      queryClient.invalidateQueries({ queryKey: ["consentimientos"] });
      queryClient.invalidateQueries({ queryKey: ["recomendaciones"] }); // M6 lee el consentimiento actualizado
      useUiStore.getState().push({ tone: "success", message: t(v.otorgado ? "grantedMsg" : "revokedMsg", { purpose: t(`purposes.${v.finalidad}.title`) }) });
    },
  });

  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;

  return (
    <div className="max-w-2xl">
      <p className="mb-2">{t("intro")}</p>
      {q.data.map((c) => (
        <SwitchField
          key={c.finalidad}
          name={`consent-${c.finalidad}`}
          label={t(`purposes.${c.finalidad}.title`)}
          hint={`${t(`purposes.${c.finalidad}.hint`)}${c.fecha ? ` · ${formatDate(c.fecha, "es-CO")}` : ""}`}
          checked={pending[c.finalidad] ?? c.otorgado}
          disabled={c.finalidad === "TRATAMIENTO" || toggle.isPending}
          onChange={(otorgado) => { setPending((p) => ({ ...p, [c.finalidad]: otorgado })); toggle.mutate({ finalidad: c.finalidad, otorgado }); }}
        />
      ))}
    </div>
  );
}

// ── Derechos ARCO (Ley 1581) ────────────────────────────────────────────────────────────────────
const ARCO_TIPOS = ["ACCESO", "RECTIFICACION", "CANCELACION", "OPOSICION"] as const;

function ArcoTab() {
  const t = useTranslations("perfil.arco");
  const tc = useTranslations("common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const q = useQuery({ queryKey: ["arco"], queryFn: async () => (await api.get<SolicitudArco[]>(routes.identidad.arco)).data });
  const [errors, setErrors] = useState<FieldErrors>({});
  const create = useMutation({
    mutationFn: async (body: { tipo: string; detalle: string }) => (await api.post<SolicitudArco>(routes.identidad.arco, { body })).data,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["arco"] });
      useUiStore.getState().push({ tone: "success", message: t("created") });
    },
  });
  const steps = [1, 2, 3, 4, 5].map((n) => t(`steps.${n}`));

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const { data, errors: fe } = validate(z.object({ tipo: z.enum(ARCO_TIPOS), detalle: z.string().min(10, t("errors.detail")) }), formValues(form));
    setErrors(fe ?? {});
    if (data) create.mutate(data, { onSuccess: () => form.reset() });
  };

  return (
    <div className="space-y-10">
      <form onSubmit={onSubmit} noValidate className="max-w-xl space-y-5">
        <h2 className="!text-2xl">{t("new")}</h2>
        <ErrorSummary errors={errors} title={tc("errorSummary")} />
        <SelectField label={t("type")} name="tipo" defaultValue="ACCESO">
          {ARCO_TIPOS.map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}
        </SelectField>
        <TextAreaField label={t("detail")} name="detalle" required error={errors.detalle} hint={t("detailHint")} />
        <Button type="submit" loading={create.isPending}>{t("submit")}</Button>
      </form>

      <section aria-labelledby="arco-list">
        <h2 id="arco-list" className="border-t-2 border-ink pt-4 !text-2xl">{t("requests")}</h2>
        {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
        {q.data?.length === 0 && <StatusBlock kind="empty" title={t("none")} />}
        <ul role="list" className="mt-4 divide-y divide-ink/15 border-y border-ink/15">
          {q.data?.map((s) => (
            <li key={s.id} className="py-5">
              <p className="flex flex-wrap items-center justify-between gap-2">
                <strong>{t(`types.${s.tipo}`)}</strong>
                <span className="meta">{formatDate(s.fecha_solicitud, locale)} · <StatusTag tone={s.estado === "CERRADA" ? "good" : "info"}>{s.estado}</StatusTag></span>
              </p>
              {s.detalle && <p className="mt-1 text-ink/90">{s.detalle}</p>}
              <div className="mt-3"><Stepper label={t("progress")} steps={steps} current={s.paso_actual ?? 1} /></div>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function DatosTab() {
  const t = useTranslations("perfil.data");
  const [busy, setBusy] = useState(false);
  const download = async () => {
    setBusy(true);
    try {
      saveBlob((await api.get<Blob>(routes.identidad.exportacionDatos)).data, "datos-personales.pdf");
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="max-w-xl space-y-4">
      <p>{t("body")}</p>
      <Button onClick={download} loading={busy}>{t("download")}</Button>
    </div>
  );
}

export function PerfilView() {
  const t = useTranslations("perfil");
  const params = useSearchParams();
  const [tab, setTab] = useState(params.get("seccion") ?? "perfil");
  useDocumentTitle(t("title"));
  return (
    <RequireRole area="turista">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        <Tabs
          label={t("title")}
          value={tab}
          onChange={setTab}
          tabs={[
            { id: "perfil", label: t("tabs.profile"), content: <PerfilTab /> },
            { id: "preferencias", label: t("tabs.preferences"), content: <PreferenciasTab /> },
            { id: "intereses", label: t("tabs.interests"), content: <InteresesTab /> },
            { id: "consentimientos", label: t("tabs.consents"), content: <ConsentimientosTab /> },
            { id: "arco", label: t("tabs.arco"), content: <ArcoTab /> },
            { id: "datos", label: t("tabs.data"), content: <DatosTab /> },
          ]}
        />
      </Container>
    </RequireRole>
  );
}

