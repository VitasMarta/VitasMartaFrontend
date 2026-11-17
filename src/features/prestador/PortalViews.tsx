"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { z } from "zod";
import { ApiError } from "@/core/api/errorNormalizer";
import { api } from "@/core/api/gatewayClient";
import { IntentKeyCache } from "@/core/api/idempotency";
import { routes } from "@/core/api/routes";
import type { SerieDashboard } from "@/core/api/types";
import { RequireRole } from "@/core/auth/RequireRole";
import { formatCOP, formatDate, formatDateTime, formatNumber, localized, rangoMensual } from "@/core/format";
import { useRouter } from "@/core/i18n/navigation";
import { useUiStore } from "@/core/store/uiStore";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { TrendChart } from "@/shared/ui/charts";
import { EditorialTable } from "@/shared/ui/EditorialTable";
import { CheckboxField, ErrorSummary, SelectField, SwitchField, TextAreaField, TextField } from "@/shared/ui/forms";
import { StatusTag } from "@/shared/ui/indicators";
import { Container, MetricRibbon, PageHeader } from "@/shared/ui/layout";
import { Pagination } from "@/shared/ui/Pagination";
import { SlideOver } from "@/shared/ui/SlideOver";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { Tabs } from "@/shared/ui/Tabs";
import { formValues, validate, type FieldErrors } from "@/shared/validate";
import { PAGE_SIZE, newClientKey, useAccionReservaM4, useIndicadoresM4, useOferta, useReservasRecibidas, type ReservaM4 } from "./api";

/** Código legible de una reserva o contenido (primeros 8 caracteres del UUID). */
const codigoCorto = (id: string) => id.slice(0, 8).toUpperCase();
import { ReservaStatus } from "@/features/reservas/util";

// ── Onboarding: autoregistro de prestador (M4) ──────────────────────────────────────────────────
const STORAGE_KEY = "vm:solicitud";
const readStored = () => {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null; // modo privado / almacenamiento bloqueado: la página funciona igual
  }
};

/** Catálogo de tipos de M4 (`catalogo_tipo_prestador`, códigos estables). */
const TIPOS_PRESTADOR = ["hotel", "restaurante", "agencia_viajes", "guia_turistico", "artesano", "operador_actividades", "otro"] as const;
/** `SegmentoPrestador` de M4. */
const SEGMENTOS = ["microempresa", "pyme", "gran_cadena", "independiente"] as const;
/** Versión de los términos que acepta el solicitante en M4. */
const VERSION_TERMINOS_M4 = "2026-01";

export function OnboardingView() {
  const t = useTranslations("prestador.onboarding");
  const tc = useTranslations("common");
  const router = useRouter();
  const params = useSearchParams();
  const [stored, setStored] = useState<string | null>(null);
  useEffect(() => setStored(readStored()), []);
  const solicitudId = params.get("solicitud") ?? stored;
  useDocumentTitle(t("title"));

  return (
    <RequireRole area="onboarding">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        {solicitudId ? (
          <SolicitudStatus id={solicitudId} onNew={() => { try { localStorage.removeItem(STORAGE_KEY); } catch {} setStored(null); router.replace("/onboarding"); }} />
        ) : (
          <SolicitudForm onCreated={(id) => { try { localStorage.setItem(STORAGE_KEY, id); } catch {} setStored(id); router.replace(`/onboarding?solicitud=${id}`); }} />
        )}
      </Container>
      <span hidden>{tc("loading")}</span>
    </RequireRole>
  );
}

type DatosSolicitud = { razon_social?: string; nombre_comercial?: string; descripcion?: { es?: string; en?: string } | null };
function SolicitudForm({ onCreated, resendId, inicial }: { onCreated: (id: string) => void; resendId?: string; inicial?: DatosSolicitud }) {
  const t = useTranslations("prestador.onboarding");
  const tc = useTranslations("common");
  const keys = useState(() => new IntentKeyCache())[0];
  const [errors, setErrors] = useState<FieldErrors>({});
  const send = useMutation({
    meta: { silent: true },
    mutationFn: async (body: Record<string, unknown>) => {
      const key = await keys.get(JSON.stringify(body), newClientKey);
      const path = resendId ? routes.prestadores.solicitudReenviar(resendId) : routes.prestadores.solicitudes;
      // M4 responde `PrestadorPublico` (`id` = tenant del prestador) al radicar y al reenviar.
      const { data } = await api.post<{ id: string }>(path, { body, idempotencyKey: key });
      keys.reset();
      return data;
    },
  });

  const schema = z.object({
    ...(resendId
      ? {}
      : {
          tipo: z.string().min(1, t("required")),
          segmento: z.string().min(1, t("required")),
          nit: z.string().regex(/^\d{9,10}(-?\d)?$/, t("nitError")),
        }),
    razon_social: z.string().min(3, t("required")), nombre_comercial: z.string().min(3, t("required")),
    email: z.string().email(t("emailError")),
    telefono: z.string().min(7, t("required")), direccion_privada: z.string().min(5, t("required")),
    rep_nombre: z.string().min(2, t("required")), rep_documento: z.string().min(5, t("required")),
    rep_email: z.string().email(t("emailError")), rep_telefono: z.string().min(7, t("required")),
    descripcion_es: z.string().min(10, t("descError")), descripcion_en: z.string().min(10, t("descError")),
    sitio_web: z.string().url(t("urlError")).optional().or(z.literal("")),
    // Al reenviar (correcciones) M4 no vuelve a pedir tipo, segmento, NIT ni consentimientos.
    ...(resendId
      ? {}
      : {
          tratamiento: z.literal(true, { error: t("consentError") }),
          terminos: z.literal(true, { error: t("termsError") }),
        }),
  });

  /**
   * Reenvío (M4 `CorreccionesSolicitudSchema`): todas las correcciones son opcionales; se envía solo lo que
   * la persona llenó (los datos privados no se precargan porque M4 no los devuelve por esta vía).
   */
  const onResend = (e: FormEvent<HTMLFormElement>) => {
    const v = formValues(e.currentTarget) as Record<string, string>;
    const s = (k: string) => (v[k] ?? "").trim();
    const fe: FieldErrors = {};
    const correo = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
    if (s("email") && !correo.test(s("email"))) fe.email = t("emailError");
    if (s("rep_email") && !correo.test(s("rep_email"))) fe.rep_email = t("emailError");
    if (s("razon_social") && s("razon_social").length < 3) fe.razon_social = t("required");
    if (s("nombre_comercial") && s("nombre_comercial").length < 3) fe.nombre_comercial = t("required");
    const rep = ["rep_nombre", "rep_documento", "rep_email"].map(s);
    if (rep.some(Boolean) && !rep.every(Boolean)) fe.rep_nombre = t("repAllRequired");
    const body: Record<string, unknown> = {};
    for (const k of ["razon_social", "nombre_comercial", "email", "telefono", "direccion_privada", "sitio_web"]) if (s(k)) body[k] = s(k);
    if (s("descripcion_es") || s("descripcion_en")) body.descripcion = { ...(s("descripcion_es") ? { es: s("descripcion_es") } : {}), ...(s("descripcion_en") ? { en: s("descripcion_en") } : {}) };
    if (rep.every(Boolean)) body.representante_legal = { nombre: rep[0], documento: rep[1], email: rep[2], ...(s("rep_telefono") ? { telefono: s("rep_telefono") } : {}) };
    if (!Object.keys(fe).length && !Object.keys(body).length) fe.form = t("nothingToCorrect");
    setErrors(fe);
    if (Object.keys(fe).length) return;
    send.mutate(body, {
      onSuccess: (r) => onCreated(r.id),
      onError: (error) => { if (error instanceof ApiError) setErrors({ ...error.fieldErrors(), ...(Object.keys(error.fieldErrors()).length ? {} : { form: error.message }) }); },
    });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (resendId) return onResend(e);
    const { data: parsed, errors: fe } = validate(schema, formValues(e.currentTarget));
    setErrors(fe ?? {});
    if (!parsed) return;
    const data = parsed as typeof parsed & { tipo?: string; segmento?: string; nit?: string };
    const comunes = {
      razon_social: data.razon_social, nombre_comercial: data.nombre_comercial, email: data.email,
      telefono: data.telefono, direccion_privada: data.direccion_privada, sitio_web: data.sitio_web || undefined,
      descripcion: { es: data.descripcion_es, en: data.descripcion_en },
      representante_legal: { nombre: data.rep_nombre, documento: data.rep_documento, email: data.rep_email, telefono: data.rep_telefono },
    };
    send.mutate(
      resendId
        ? comunes // `CorreccionesSolicitudSchema` (extra=forbid)
        : {
            ...comunes,
            tipo: data.tipo, segmento: data.segmento, nit: data.nit,
            // M4 exige las dos finalidades obligatorias (FINALIDADES_OBLIGATORIAS).
            consentimientos: [
              { finalidad: "tratamiento_datos_personales", version_terminos: VERSION_TERMINOS_M4, aceptado: true },
              { finalidad: "terminos_servicio", version_terminos: VERSION_TERMINOS_M4, aceptado: true },
            ],
          },
      {
        onSuccess: (r) => onCreated(r.id),
        onError: (error) => {
          if (error instanceof ApiError) setErrors({ ...error.fieldErrors(), ...(Object.keys(error.fieldErrors()).length ? {} : { form: error.message }) });
        },
      },
    );
  };

  return (
    <form onSubmit={onSubmit} noValidate className="max-w-3xl space-y-8">
      <ErrorSummary errors={errors} title={tc("errorSummary")} />
      <fieldset className="card p-5 sm:p-6 grid gap-6 sm:grid-cols-2">
        <legend className="float-left col-span-full mb-0 w-full border-b border-line pb-2 text-xl font-semibold">{t("business")}</legend>
        {!resendId && (
          <>
            <SelectField label={t("type")} name="tipo" defaultValue="" required error={errors.tipo}>
              <option value="" disabled>—</option>
              {TIPOS_PRESTADOR.map((x) => <option key={x} value={x}>{t(`types.${x}`)}</option>)}
            </SelectField>
            <SelectField label={t("segment")} name="segmento" defaultValue="" required error={errors.segmento}>
              <option value="" disabled>—</option>
              {SEGMENTOS.map((x) => <option key={x} value={x}>{t(`segments.${x}`)}</option>)}
            </SelectField>
          </>
        )}
        <TextField label={t("legalName")} name="razon_social" required={!resendId} defaultValue={inicial?.razon_social} error={errors.razon_social} />
        <TextField label={t("tradeName")} name="nombre_comercial" required={!resendId} defaultValue={inicial?.nombre_comercial} error={errors.nombre_comercial} />
        <TextField label={t("email")} name="email" type="email" required error={errors.email} />
        {!resendId && <TextField label={t("nit")} name="nit" required error={errors.nit} hint={t("nitHint")} />}
        <TextField label={t("phone")} name="telefono" type="tel" required error={errors.telefono} />
        <TextField label={t("website")} name="sitio_web" type="url" error={errors.sitio_web} />
        <TextField label={t("address")} name="direccion_privada" required error={errors.direccion_privada} hint={t("addressHint")} className="sm:col-span-2" />
        <TextAreaField label={t("descEs")} name="descripcion_es" required={!resendId} defaultValue={inicial?.descripcion?.es} error={errors.descripcion_es} className="sm:col-span-2" />
        <TextAreaField label={t("descEn")} name="descripcion_en" required={!resendId} defaultValue={inicial?.descripcion?.en} error={errors.descripcion_en} className="sm:col-span-2" />
      </fieldset>
      <fieldset className="card p-5 sm:p-6 grid gap-6 sm:grid-cols-2">
        <legend className="float-left col-span-full mb-0 w-full border-b border-line pb-2 text-xl font-semibold">{t("legalRep")}</legend>
        <TextField label={t("repName")} name="rep_nombre" required error={errors.rep_nombre} />
        <TextField label={t("repDocument")} name="rep_documento" required error={errors.rep_documento} />
        <TextField label={t("repEmail")} name="rep_email" type="email" required error={errors.rep_email} />
        <TextField label={t("repPhone")} name="rep_telefono" type="tel" required error={errors.rep_telefono} />
      </fieldset>
      {!resendId && (
        <>
          <CheckboxField label={t("consent")} name="tratamiento" required error={errors.tratamiento} />
          <CheckboxField label={t("terms")} name="terminos" required error={errors.terminos} />
        </>
      )}
      {errors.form && <p role="alert" className="font-medium text-critical">{errors.form}</p>}
      <Button type="submit" loading={send.isPending}>{resendId ? t("resend") : t("submit")}</Button>
    </form>
  );
}

function SolicitudStatus({ id, onNew }: { id: string; onNew: () => void }) {
  const t = useTranslations("prestador.onboarding");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [resending, setResending] = useState(false);
  const qc = useQueryClient();
  const q = useQuery({
    queryKey: ["m4", "solicitud", id],
    // M4 `SolicitudDetalle`: { prestador: PrestadorPublico, historial: TransicionHistorial[] }.
    queryFn: async () =>
      (
        await api.get<{
          prestador: { estado: string; razon_social?: string; nombre_comercial?: string; descripcion?: { es?: string; en?: string } | null; motivo_estado?: string | null };
          historial: { estado_origen?: string; estado_destino: string; ocurrido_en: string; motivo?: string | null }[];
        }>(routes.prestadores.solicitud(id))
      ).data,
  });
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <div className="space-y-4"><ErrorNotice error={q.error} referenceLabel={tc("reference")} /><Button variant="secondary" onClick={onNew}>{t("startNew")}</Button></div>;
  const { prestador, historial } = q.data;
  const tone = prestador.estado === "aprobado" ? "good" : prestador.estado === "rechazado" ? "bad" : "warn";

  return (
    <div className="max-w-3xl space-y-6">
      <p className="flex items-center gap-3 text-lg">{t("status")}: <StatusTag tone={tone}>{t.has(`statuses.${prestador.estado}`) ? t(`statuses.${prestador.estado}`) : prestador.estado}</StatusTag></p>
      {prestador.estado === "aprobado" && <p className="border-l-4 border-emerald pl-3">{t("approvedHelp")}</p>}
      {prestador.estado === "pendiente" && <p className="border-l-4 border-ink pl-3">{t("pendingHelp")}</p>}
      {prestador.estado === "rechazado" && (
        <div className="border-l-4 border-critical pl-3">
          <p className="font-semibold">{t("rejectedReason")}</p>
          <p>{prestador.motivo_estado}</p>
        </div>
      )}
      <ol className="divide-y divide-line rounded-md border border-line bg-card px-4">
        {historial.map((h, i) => (
          <li key={i} className="py-3"><strong>{t.has(`statuses.${h.estado_destino}`) ? t(`statuses.${h.estado_destino}`) : h.estado_destino}</strong> <span className="meta text-ink/80">· {formatDate(h.ocurrido_en, locale)}{h.motivo ? ` · ${h.motivo}` : ""}</span></li>
        ))}
      </ol>
      {prestador.estado === "rechazado" && !resending && <Button onClick={() => setResending(true)}>{t("correctResend")}</Button>}
      {resending && <p className="border-l-4 border-ink pl-3 text-sm">{t("resendHelp")}</p>}
      {resending && <SolicitudForm resendId={id} inicial={prestador} onCreated={() => { setResending(false); qc.invalidateQueries({ queryKey: ["m4", "solicitud", id] }); }} />}
      <Button variant="ghost" onClick={onNew}>{t("startNew")}</Button>
    </div>
  );
}

// ── Reservas recibidas (confirmar / rechazar / cancelar con Idempotency-Key) ────────────────────
export function ReceivedReservationsView() {
  const t = useTranslations("prestador.received");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [page, setPage] = useState(1);
  const [estado, setEstado] = useState("");
  const [panel, setPanel] = useState<{ row: ReservaM4; accion: "confirmar" | "rechazar" | "cancelar" } | null>(null);
  const [error, setError] = useState<string>();
  const q = useReservasRecibidas(page, estado || undefined);
  // M4 solo envía `contenido_id`: el nombre se toma de la oferta propia del prestador.
  const oferta = useOferta("atractivos", 1);
  const nombres = new Map((oferta.data?.items ?? []).map((c) => [c.id, localized(c.nombre, locale)] as const));
  const mutation = useAccionReservaM4();
  const keys = useState(() => new IntentKeyCache())[0]; // misma clave si se reintenta la misma acción
  useDocumentTitle(t("title"));

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
    if (panel?.accion !== "confirmar" && !motivo) return setError(t("reasonRequired"));
    setError(undefined);
    const { row, accion } = panel!;
    const key = await keys.get(`${row.id}|${accion}|${motivo}`, newClientKey);
    mutation.mutate({ id: row.id, accion, motivo, key }, {
      onSuccess: () => { keys.reset(); setPanel(null); useUiStore.getState().push({ tone: "success", message: t(`done.${accion}`) }); },
    });
  };

  return (
    <RequireRole area="prestador">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        <div className="mb-4 max-w-xs">
          <SelectField label={t("filter")} name="estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPage(1); }}>
            <option value="">{t("all")}</option>
            {["pendiente_confirmacion", "confirmada", "cancelada", "rechazada", "expirada"].map((s) => <option key={s} value={s}>{t(`states.${s}`)}</option>)}
          </SelectField>
        </div>
        {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
        {q.data && (
          <>
            <EditorialTable
              caption={t("title")}
              rows={q.data.items}
              rowKey={(r) => r.id}
              empty={t("empty")}
              columns={[
                { key: "c", header: t("code"), cell: (r) => <span className="font-mono text-sm">{codigoCorto(r.id)}</span> },
                { key: "s", header: t("service"), cell: (r) => <span className="font-semibold">{(r.contenido_id && nombres.get(r.contenido_id)) || (r.contenido_id ? codigoCorto(r.contenido_id) : "—")}</span> },
                { key: "f", header: t("date"), cell: (r) => formatDateTime(r.fecha_creacion, locale) },
                { key: "m", header: t("total"), align: "right", cell: (r) => (r.total != null && !Number.isNaN(Number(r.total)) ? formatCOP(Number(r.total), locale) : "—") },
                { key: "e", header: tc("status"), cell: (r) => <ReservaStatus estado={r.estado} /> },
                {
                  key: "a",
                  header: <span className="sr-only">{tc("actions")}</span>,
                  cell: (r) =>
                    r.estado === "pendiente_confirmacion" || r.estado === "confirmada" ? (
                      <span className="flex flex-wrap gap-x-4 gap-y-1">
                        {r.estado === "pendiente_confirmacion" && (
                          <>
                            <button type="button" className="text-link font-semibold" onClick={() => setPanel({ row: r, accion: "confirmar" })}>{t("actions.confirmar")}<span className="sr-only"> {codigoCorto(r.id)}</span></button>
                            <button type="button" className="text-link font-semibold" onClick={() => setPanel({ row: r, accion: "rechazar" })}>{t("actions.rechazar")}<span className="sr-only"> {codigoCorto(r.id)}</span></button>
                          </>
                        )}
                        <button type="button" className="text-link font-semibold text-critical" onClick={() => setPanel({ row: r, accion: "cancelar" })}>{t("actions.cancelar")}<span className="sr-only"> {codigoCorto(r.id)}</span></button>
                      </span>
                    ) : null,
                },
              ]}
            />
            <Pagination base={1} page={page} pageSize={PAGE_SIZE} total={q.data.total} onChange={setPage} />
          </>
        )}
      </Container>
      <SlideOver open={panel !== null} onClose={() => { setPanel(null); setError(undefined); }} title={panel ? t(`actions.${panel.accion}`) : ""}>
        {panel && (
          <form onSubmit={onSubmit} noValidate className="space-y-5">
            <p>{t("confirmText", { code: codigoCorto(panel.row.id), service: (panel.row.contenido_id && nombres.get(panel.row.contenido_id)) || "—" })}</p>
            <TextAreaField label={panel.accion === "confirmar" ? t("noteOptional") : t("reason")} name="motivo" required={panel.accion !== "confirmar"} error={error} />
            <div className="flex gap-3">
              <Button type="submit" variant={panel.accion === "confirmar" ? "primary" : "danger"} loading={mutation.isPending}>{tc("confirm")}</Button>
              <Button variant="secondary" onClick={() => setPanel(null)}>{tc("back")}</Button>
            </div>
          </form>
        )}
      </SlideOver>
    </RequireRole>
  );
}

// ── Check-in QR (CU-27) ─────────────────────────────────────────────────────────────────────────
interface CheckinResult {
  valido: boolean;
  reserva_id: string | null;
  estado: string | null;
  mensaje: string;
  validado_en: string;
}
export function CheckinView() {
  const t = useTranslations("prestador.checkin");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [history, setHistory] = useState<CheckinResult[]>([]);
  const [error, setError] = useState<unknown>(null);
  useDocumentTitle(t("title"));
  const validar = useMutation({
    meta: { silent: true },
    mutationFn: async (codigo_qr: string) => (await api.post<CheckinResult>(routes.prestadores.checkIn, { body: { codigo_qr } })).data,
  });

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const form = e.currentTarget;
    const code = String(new FormData(form).get("codigo_qr") ?? "").trim();
    if (!code) return;
    setError(null);
    validar.mutate(code, {
      onSuccess: (r) => { setHistory((h) => [r, ...h].slice(0, 8)); form.reset(); (form.elements.namedItem("codigo_qr") as HTMLInputElement | null)?.focus(); },
      onError: setError,
    });
  };
  const last = history[0];
  const limited = error instanceof ApiError && error.status === 429;

  return (
    <RequireRole area="prestador">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        <form onSubmit={onSubmit} className="card max-w-xl space-y-4 p-5 sm:p-6">
          <TextField label={t("code")} name="codigo_qr" autoComplete="off" hint={t("hint")} required />
          <Button type="submit" loading={validar.isPending}>{t("validate")}</Button>
        </form>
        <div aria-live="assertive" className="mt-8 max-w-xl">
          {limited && <p role="alert" className="border-l-4 border-preventive pl-3 font-medium">{t("rateLimited")}</p>}
          {error != null && !limited && <ErrorNotice error={error} referenceLabel={tc("reference")} />}
          {last && (
            <p className={`border-l-4 py-2 pl-3 text-lg font-semibold ${last.valido ? "border-emerald text-emerald-ink" : "border-critical text-critical"}`}>
              {last.valido ? "✓ " : "✕ "}
              {last.mensaje}
            </p>
          )}
        </div>
        {history.length > 0 && (
          <section aria-labelledby="ci-hist" className="mt-8 max-w-xl">
            <h2 id="ci-hist" className="mb-1 !text-xl">{t("recent")}</h2>
            <ul role="list" className="mt-2 divide-y divide-line">
              {history.map((h, i) => (
                <li key={i} className="py-2"><StatusTag tone={h.valido ? "good" : "bad"}>{h.valido ? t("valid") : t("invalid")}</StatusTag> <span className="meta text-ink/80">· {formatDateTime(h.validado_en, locale)} · {h.reserva_id ?? "—"}</span></li>
              ))}
            </ul>
          </section>
        )}
      </Container>
    </RequireRole>
  );
}

// ── Mis indicadores (M4 + M9 aislados por tenant) ───────────────────────────────────────────────
export function IndicatorsView() {
  const t = useTranslations("prestador.indicators");
  const tc = useTranslations("common");
  const locale = useLocale();
  const today = new Date().toISOString().slice(0, 10);
  const [range, setRange] = useState({ desde: new Date(Date.now() - 30 * 86_400_000).toISOString().slice(0, 10), hasta: today });
  const q = useIndicadoresM4(range.desde, range.hasta);
  const series = useQuery({
    queryKey: ["m9", "series", "mi-ocupacion"],
    // LINEA_TENDENCIA exige `desde` y `hasta` mensuales (M9).
    queryFn: async () => (await api.get<SerieDashboard>(routes.reportes.series, { query: { indicador: "reservas_por_periodo", tipo: "LINEA_TENDENCIA", ...rangoMensual(6) } })).data,
    retry: false,
  });
  useDocumentTitle(t("title"));

  const ind = q.data?.indicadores;
  return (
    <RequireRole area="prestador">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-6">
        <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setRange({ desde: String(f.get("desde")), hasta: String(f.get("hasta")) }); }}>
          <TextField label={t("from")} name="desde" type="date" defaultValue={range.desde} max={today} />
          <TextField label={t("to")} name="hasta" type="date" defaultValue={range.hasta} max={today} />
          <Button type="submit">{t("apply")}</Button>
        </form>
      </Container>
      {q.isPending && <Container><StatusBlock kind="loading" title={tc("loading")} /></Container>}
      {q.isError && <Container><ErrorNotice error={q.error} referenceLabel={tc("reference")} /></Container>}
      {ind && (
        <MetricRibbon
          label={t("title")}
          items={[
            { label: t("total"), value: formatNumber(ind.reservas_total, locale) },
            { label: t("confirmed"), value: formatNumber(ind.reservas_confirmadas, locale), delta: `${Math.round((ind.reservas_confirmadas / Math.max(1, ind.reservas_total)) * 100)} %` },
            { label: t("cancelled"), value: formatNumber(ind.reservas_canceladas, locale) },
            { label: t("income"), value: formatCOP(ind.ingresos_cop, locale) },
            { label: t("occupancy"), value: `${ind.ocupacion_promedio_porcentaje} %` },
            { label: t("published"), value: ind.contenidos_publicados },
          ]}
        />
      )}
      <Container className="py-8">
        {q.data && <TrendChart label={t("bookingsChart")} valueLabel={t("total")} data={q.data.series.map((s) => ({ x: s.periodo.slice(5), y: s.reservas }))} />}
        {series.data && <div className="mt-8"><TrendChart label={t("m9Chart")} valueLabel={t("m9Value")} data={series.data.puntos.map((p) => ({ x: (p.periodo ?? p.etiqueta ?? "").slice(5), y: p.valor }))} /></div>}
      </Container>
    </RequireRole>
  );
}

// ── Mi negocio: perfil, configuración de reservas y política de cancelación ─────────────────────
type Versioned = { version: number; [k: string]: unknown };
function useVersioned(key: string, path: string) {
  const qc = useQueryClient();
  // 404 = el prestador aún no la ha creado (configuración/política nuevas): se edita sobre valores por defecto.
  const q = useQuery({
    queryKey: ["m4", key],
    queryFn: async (): Promise<Versioned | null> => {
      try {
        return (await api.get<Versioned>(path)).data;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const [conflict, setConflict] = useState(false);
  const save = useMutation({
    meta: { silent: true },
    mutationFn: async ({ method, body }: { method: "patch" | "put"; body: Record<string, unknown> }) =>
      (await api[method]<Versioned>(path, { body: { ...(q.data?.version != null ? { version_esperada: q.data.version } : {}), ...body } })).data,
    onSuccess: () => { setConflict(false); qc.invalidateQueries({ queryKey: ["m4", key] }); useUiStore.getState().push({ tone: "success", message: "✓" }); },
    onError: (e) => { if (e instanceof ApiError && e.isVersionConflict) setConflict(true); else if (e instanceof ApiError) useUiStore.getState().push({ tone: "error", message: e.message, reference: e.correlationId }); },
  });
  return { q, save, conflict, reload: () => { setConflict(false); return q.refetch(); } };
}

function ConflictStrip({ onReload }: { onReload: () => void }) {
  const t = useTranslations("prestador.editor");
  return (
    <div role="alert" className="rounded-md border border-l-4 border-preventive bg-card px-4 py-3">
      <p className="font-semibold">{t("conflictTitle")}</p>
      <p className="mt-1 text-sm">{t("conflictHelp")}</p>
      <Button className="mt-3" variant="secondary" onClick={onReload}>{t("reload")}</Button>
    </div>
  );
}

function ProfileTab() {
  const t = useTranslations("prestador.business");
  const tc = useTranslations("common");
  const { q, save, conflict, reload } = useVersioned("perfil", routes.prestadores.miPerfil);
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  const d = (q.data ?? {}) as Partial<Versioned> & { nombre_comercial?: string; sitio_web?: string; descripcion?: { es?: string; en?: string } };
  return (
    <form key={d.version} className="max-w-2xl space-y-6" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); save.mutate({ method: "patch", body: { nombre_comercial: f.get("nombre_comercial"), sitio_web: f.get("sitio_web") || undefined, descripcion: { es: f.get("descripcion_es"), en: f.get("descripcion_en") } } }); }}>
      {conflict && <ConflictStrip onReload={reload} />}
      <TextField label={t("tradeName")} name="nombre_comercial" defaultValue={d.nombre_comercial} required />
      <TextField label={t("website")} name="sitio_web" type="url" defaultValue={d.sitio_web} />
      <TextAreaField label={t("descEs")} name="descripcion_es" defaultValue={d.descripcion?.es} />
      <TextAreaField label={t("descEn")} name="descripcion_en" defaultValue={d.descripcion?.en} />
      <Button type="submit" loading={save.isPending}>{tc("save")}</Button>
    </form>
  );
}

function BookingConfigTab() {
  const t = useTranslations("prestador.business");
  const tc = useTranslations("common");
  const { q, save, conflict, reload } = useVersioned("config-reservas", routes.prestadores.configuracionReservas);
  const [manual, setManual] = useState<boolean | null>(null);
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  // M4 `ConfiguracionReservasEntrada`: instrucciones_pago es bilingüe ({ es, en }).
  const d = (q.data ?? { requiere_confirmacion_manual: true, tiempo_maximo_confirmacion_minutos: 120 }) as Partial<Versioned> & {
    requiere_confirmacion_manual: boolean; tiempo_maximo_confirmacion_minutos: number; instrucciones_pago?: { es?: string; en?: string }; medios_pago?: string[];
  };
  const on = manual ?? d.requiere_confirmacion_manual;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const es = String(f.get("instrucciones_es") ?? "").trim();
    const en = String(f.get("instrucciones_en") ?? "").trim();
    save.mutate({ method: "put", body: {
      requiere_confirmacion_manual: on,
      tiempo_maximo_confirmacion_minutos: Number(f.get("tiempo")),
      instrucciones_pago: es || en ? { ...(es ? { es } : {}), ...(en ? { en } : {}) } : undefined,
      medios_pago: String(f.get("medios")).split(",").map((s) => s.trim()).filter(Boolean),
    } });
  };
  return (
    <form key={d.version ?? "nueva"} className="max-w-2xl space-y-6" onSubmit={onSubmit}>
      {conflict && <ConflictStrip onReload={reload} />}
      {q.data === null && <p role="status" className="border-l-4 border-ink pl-3">{t("notCreatedYet")}</p>}
      <SwitchField label={t("manualConfirm")} name="manual" hint={t("manualHint")} checked={on} onChange={setManual} />
      <TextField label={t("confirmTime")} name="tiempo" type="number" min={5} max={10080} defaultValue={d.tiempo_maximo_confirmacion_minutos} hint={t("confirmTimeHint")} className="max-w-60" />
      <TextAreaField label={t("paymentInstructionsEs")} name="instrucciones_es" defaultValue={d.instrucciones_pago?.es} required />
      <TextAreaField label={t("paymentInstructionsEn")} name="instrucciones_en" defaultValue={d.instrucciones_pago?.en} />
      <TextField label={t("paymentMethods")} name="medios" defaultValue={d.medios_pago?.join(", ")} hint={t("paymentMethodsHint")} />
      <Button type="submit" loading={save.isPending}>{tc("save")}</Button>
    </form>
  );
}

function PolicyTab() {
  const t = useTranslations("prestador.business");
  const tc = useTranslations("common");
  const { q, save, conflict, reload } = useVersioned("politica", routes.prestadores.politicaCancelacion);
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  // M4 `PoliticaCancelacionEntrada`: descripcion y condiciones son bilingües ({ es, en }).
  type Texto = { es?: string; en?: string };
  const d = (q.data ?? { tipo: "moderada", horas_limite_cancelacion: 24, penalidad_porcentaje: 20 }) as Partial<Versioned> & {
    tipo: string; horas_limite_cancelacion: number; penalidad_porcentaje: number; descripcion?: Texto; condiciones?: Texto | null;
  };
  const texto = (f: FormData, base: string): Texto | undefined => {
    const es = String(f.get(`${base}_es`) ?? "").trim();
    const en = String(f.get(`${base}_en`) ?? "").trim();
    return es || en ? { ...(es ? { es } : {}), ...(en ? { en } : {}) } : undefined;
  };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    save.mutate({ method: "put", body: {
      tipo: f.get("tipo"),
      horas_limite_cancelacion: Number(f.get("horas")),
      penalidad_porcentaje: Number(f.get("penalidad")),
      descripcion: texto(f, "descripcion"),
      condiciones: texto(f, "condiciones"),
    } });
  };
  return (
    <form key={d.version ?? "nueva"} className="max-w-2xl space-y-6" onSubmit={onSubmit}>
      {conflict && <ConflictStrip onReload={reload} />}
      {q.data === null && <p role="status" className="border-l-4 border-ink pl-3">{t("notCreatedYet")}</p>}
      <SelectField label={t("policyType")} name="tipo" defaultValue={d.tipo}>
        {["flexible", "moderada", "estricta"].map((x) => <option key={x} value={x}>{t(`policyTypes.${x}`)}</option>)}
      </SelectField>
      <div className="grid gap-6 sm:grid-cols-2">
        <TextField label={t("hoursLimit")} name="horas" type="number" min={0} defaultValue={d.horas_limite_cancelacion} />
        <TextField label={t("penalty")} name="penalidad" type="number" min={0} max={100} defaultValue={d.penalidad_porcentaje} />
      </div>
      <TextAreaField label={t("policyDescriptionEs")} name="descripcion_es" defaultValue={d.descripcion?.es} required />
      <TextAreaField label={t("policyDescriptionEn")} name="descripcion_en" defaultValue={d.descripcion?.en} />
      <TextAreaField label={t("conditionsEs")} name="condiciones_es" defaultValue={d.condiciones?.es} />
      <TextAreaField label={t("conditionsEn")} name="condiciones_en" defaultValue={d.condiciones?.en} />
      <Button type="submit" loading={save.isPending}>{tc("save")}</Button>
    </form>
  );
}

export function BusinessView() {
  const t = useTranslations("prestador.business");
  useDocumentTitle(t("title"));
  return (
    <RequireRole area="prestador">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        <Tabs label={t("title")} tabs={[
          { id: "perfil", label: t("tabs.profile"), content: <ProfileTab /> },
          { id: "reservas", label: t("tabs.booking"), content: <BookingConfigTab /> },
          { id: "politica", label: t("tabs.policy"), content: <PolicyTab /> },
        ]} />
      </Container>
    </RequireRole>
  );
}
