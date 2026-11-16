"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/core/api/errorNormalizer";
import { api } from "@/core/api/gatewayClient";
import { routes } from "@/core/api/routes";
import type { AlertaAmbiental, ConfiguracionCapacidad, PageResponse, ResultadoBusqueda } from "@/core/api/types";
import { RequireRole } from "@/core/auth/RequireRole";
import { formatDate, formatDateTime, localized } from "@/core/format";
import { useUiStore } from "@/core/store/uiStore";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { TrendChart } from "@/shared/ui/charts";
import { EditorialTable } from "@/shared/ui/EditorialTable";
import { ErrorSummary, SelectField, SwitchField, TextAreaField, TextField } from "@/shared/ui/forms";
import { StatusTag } from "@/shared/ui/indicators";
import { Container, MetricRibbon, PageHeader } from "@/shared/ui/layout";
import { Pagination } from "@/shared/ui/Pagination";
import { SlideOver } from "@/shared/ui/SlideOver";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { Tabs } from "@/shared/ui/Tabs";
import { PipelinePanel } from "./AnaliticaViews";

const toast = (tone: "success" | "error" | "warn", message: string, reference?: string) => useUiStore.getState().push({ tone, message, reference });

/** Atractivos naturales del catálogo (M2) para elegir el destino a gestionar. */
function useAtractivos() {
  return useQuery({
    queryKey: ["catalogo", "todos"],
    queryFn: async () => (await api.get<ResultadoBusqueda>(routes.catalogo.busqueda, { auth: false, query: { limite: 100 } })).data.items.filter((i) => i.tipo === "atractivo" || !i.tipo),
    staleTime: 5 * 60_000,
  });
}

// ── Capacidad de carga ──────────────────────────────────────────────────────────────────────────
function CapacityTab({ id }: { id: string }) {
  const t = useTranslations("admin.environment.capacity");
  const tc = useTranslations("common");
  const locale = useLocale();
  const qc = useQueryClient();
  const q = useQuery({ queryKey: ["m8", "capacidad", id], queryFn: async () => (await api.get<ConfiguracionCapacidad>(routes.ambiental.capacidad(id))).data });
  const versions = useQuery({ queryKey: ["m8", "versiones", id], queryFn: async () => (await api.get<ConfiguracionCapacidad[]>(routes.ambiental.capacidadVersiones(id))).data });
  const log = useQuery({ queryKey: ["m8", "cambios", id], queryFn: async () => (await api.get<{ version: number; campo: string; antes: unknown; despues: unknown; fecha: string; usuario: string }[]>(routes.ambiental.capacidadAuditoria(id))).data });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restrict, setRestrict] = useState<boolean | null>(null);
  const save = useMutation({
    meta: { silent: true },
    mutationFn: async (body: Partial<ConfiguracionCapacidad>) => (await api.put<ConfiguracionCapacidad>(routes.ambiental.capacidad(id), { body })).data,
    onSuccess: (d) => { toast("success", t("saved", { version: d.version ?? 0 })); setErrors({}); qc.invalidateQueries({ queryKey: ["m8"] }); },
    onError: (e) => e instanceof ApiError && setErrors({ ...e.fieldErrors(), ...(Object.keys(e.fieldErrors()).length ? {} : { form: e.message }) }),
  });

  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  const c = q.data;
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k));
    const next: Record<string, string> = {};
    if (!(n("capacidad_carga") > 0)) next.capacidad_carga = t("positive");
    if (n("umbral_preventivo") <= n("umbral_recomendacion")) next.umbral_preventivo = t("order.preventive");
    if (n("umbral_critico") <= n("umbral_preventivo")) next.umbral_critico = t("order.critical");
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      capacidad_carga: n("capacidad_carga"), umbral_recomendacion: n("umbral_recomendacion"), umbral_preventivo: n("umbral_preventivo"), umbral_critico: n("umbral_critico"),
      fuente_criterio: String(f.get("fuente_criterio")), vigencia_desde: String(f.get("vigencia_desde")), vigencia_hasta: String(f.get("vigencia_hasta")), restriccion_reservas: restrict ?? c.restriccion_reservas,
    });
  };

  return (
    <div className="space-y-10">
      {c.criterio_vencido && <p role="alert" className="border-l-4 border-critical pl-3 font-semibold text-critical">{t("expired")}</p>}
      <form key={c.version} onSubmit={onSubmit} noValidate className="max-w-3xl space-y-6">
        <ErrorSummary errors={errors} title={tc("errorSummary")} />
        <p className="meta">{t("currentVersion", { version: c.version ?? 1, user: c.responsable ?? "—" })}</p>
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField label={t("capacity")} name="capacidad_carga" type="number" min={1} defaultValue={c.capacidad_carga} error={errors.capacidad_carga} required />
          <TextField label={t("source")} name="fuente_criterio" defaultValue={c.fuente_criterio} />
          <TextField label={t("recommendation")} name="umbral_recomendacion" type="number" min={0} max={100} defaultValue={c.umbral_recomendacion} error={errors.umbral_recomendacion} required />
          <TextField label={t("preventive")} name="umbral_preventivo" type="number" min={0} max={100} defaultValue={c.umbral_preventivo} error={errors.umbral_preventivo} required />
          <TextField label={t("critical")} name="umbral_critico" type="number" min={0} max={100} defaultValue={c.umbral_critico} error={errors.umbral_critico} required />
          <span />
          <TextField label={t("validFrom")} name="vigencia_desde" type="date" defaultValue={c.vigencia_desde} />
          <TextField label={t("validTo")} name="vigencia_hasta" type="date" defaultValue={c.vigencia_hasta} />
        </div>
        <SwitchField label={t("restrict")} name="restriccion" hint={t("restrictHint")} checked={restrict ?? c.restriccion_reservas ?? false} onChange={setRestrict} />
        {errors.form && <p role="alert" className="font-medium text-critical">{errors.form}</p>}
        <p className="text-sm">{t("immutable")}</p>
        <Button type="submit" loading={save.isPending}>{t("publishVersion")}</Button>
      </form>

      <section aria-labelledby="versions"><h3 id="versions" className="border-t-2 border-ink pt-4 !text-xl">{t("versions")}</h3>
        {versions.data && <EditorialTable caption={t("versions")} rows={versions.data} rowKey={(v) => String(v.version)} columns={[
          { key: "v", header: "v", align: "right", cell: (v) => v.version }, { key: "c", header: t("capacity"), align: "right", cell: (v) => v.capacidad_carga },
          { key: "u", header: t("thresholds"), cell: (v) => `${v.umbral_recomendacion} / ${v.umbral_preventivo} / ${v.umbral_critico}` },
          { key: "d", header: t("validity"), cell: (v) => `${formatDate(v.vigencia_desde, locale)} → ${formatDate(v.vigencia_hasta, locale)}` }, { key: "r", header: t("responsible"), cell: (v) => v.responsable },
        ]} />}
      </section>
      <section aria-labelledby="changes"><h3 id="changes" className="border-t-2 border-ink pt-4 !text-xl">{t("changes")}</h3>
        {log.data && <EditorialTable caption={t("changes")} rows={log.data} empty={t("noChanges")} rowKey={(r) => `${r.version}-${r.campo}`} columns={[
          { key: "v", header: "v", align: "right", cell: (r) => r.version }, { key: "f", header: t("field"), cell: (r) => r.campo },
          { key: "a", header: t("before"), cell: (r) => String(r.antes ?? "—") }, { key: "d", header: t("after"), cell: (r) => String(r.despues ?? "—") },
          { key: "t", header: tc("date"), cell: (r) => formatDateTime(r.fecha, locale) }, { key: "u", header: t("responsible"), cell: (r) => r.usuario },
        ]} />}
      </section>
    </div>
  );
}

function ConflictTab({ id }: { id: string }) {
  const t = useTranslations("admin.environment.conflict");
  const tc = useTranslations("common");
  const send = useMutation({ mutationFn: async (body: Record<string, unknown>) => api.post(routes.ambiental.conflictos(id), { body }), onSuccess: () => toast("success", t("saved")) });
  return (
    <form className="max-w-xl space-y-6" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); send.mutate({ atractivo_ref: id, capacidad_externa: Number(f.get("capacidad_externa")), fuente_externa: f.get("fuente_externa"), decision: f.get("decision") }); }}>
      <p>{t("intro")}</p>
      <TextField label={t("externalCapacity")} name="capacidad_externa" type="number" min={1} required />
      <TextField label={t("externalSource")} name="fuente_externa" defaultValue="CORPAMAG" required />
      <SelectField label={t("decision")} name="decision" defaultValue="INTERNA_PREVALECE">
        <option value="INTERNA_PREVALECE">{t("internal")}</option><option value="DECISION_EXPLICITA">{t("explicit")}</option>
      </SelectField>
      <Button type="submit" loading={send.isPending}>{tc("save")}</Button>
    </form>
  );
}

function OccupancyTab({ id }: { id: string }) {
  const t = useTranslations("admin.environment.occupancy");
  const tc = useTranslations("common");
  const q = useQuery({ queryKey: ["m8", "ocupacion", id], queryFn: async () => (await api.get<{ ocupacion_estimada: number; ventana_minutos: number; insumos: { nombre: string; valor: number; peso: number }[] }>(routes.ambiental.ocupacion(id))).data });
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  return (
    <>
      <MetricRibbon label={t("title")} items={[{ label: t("estimated"), value: `${Math.round(q.data.ocupacion_estimada)} %` }, { label: t("window"), value: `${q.data.ventana_minutos} min` }]} />
      <div className="mt-6"><EditorialTable caption={t("inputs")} rows={q.data.insumos} rowKey={(i) => i.nombre} columns={[
        { key: "n", header: t("input"), cell: (i) => i.nombre }, { key: "v", header: t("value"), align: "right", cell: (i) => `${i.valor} %` }, { key: "p", header: t("weight"), align: "right", cell: (i) => `${Math.round(i.peso * 100)} %` },
      ]} /></div>
    </>
  );
}

function HistoryTab({ id }: { id: string }) {
  const t = useTranslations("admin.environment.history");
  const tc = useTranslations("common");
  const [range, setRange] = useState({ desde: "", hasta: "" });
  const q = useQuery({ queryKey: ["m8", "historico", id, range], queryFn: async () => (await api.get<{ serie: { fecha: string; ocupacion_promedio: number }[] }>(routes.ambiental.historico(id), { query: range })).data });
  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); setRange({ desde: String(f.get("desde") ?? ""), hasta: String(f.get("hasta") ?? "") }); }}>
        <TextField label={t("from")} name="desde" type="date" /><TextField label={t("to")} name="hasta" type="date" /><Button type="submit">{t("apply")}</Button>
      </form>
      {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
      {q.data && <TrendChart label={t("chart")} valueLabel={t("occupancy")} format={(n) => `${n} %`} data={q.data.serie.map((s) => ({ x: s.fecha.slice(0, 7), y: s.ocupacion_promedio }))} />}
    </div>
  );
}

function GoodPracticesTab({ id }: { id: string }) {
  const t = useTranslations("admin.environment.practices");
  const tc = useTranslations("common");
  const [error, setError] = useState<string>();
  const send = useMutation({
    meta: { silent: true },
    mutationFn: async (contenido: string) => api.post(routes.ambiental.buenasPracticas(id), { body: { contenido } }),
    onSuccess: () => toast("success", t("saved")),
    onError: (e) => e instanceof ApiError && setError(e.status === 400 ? t("notNatural") : e.message),
  });
  return (
    <form className="max-w-2xl space-y-6" noValidate onSubmit={(e) => { e.preventDefault(); const v = String(new FormData(e.currentTarget).get("contenido") ?? "").trim(); if (v.length < 20) return setError(t("tooShort")); setError(undefined); send.mutate(v); }}>
      <TextAreaField label={t("content")} name="contenido" rows={7} required error={error} hint={t("hint")} />
      <Button type="submit" loading={send.isPending}>{t("publish")}</Button>
      <span hidden>{tc("save")}</span>
    </form>
  );
}

function RetentionPanel() {
  const t = useTranslations("admin.environment.retention");
  const [error, setError] = useState<string>();
  const save = useMutation({
    meta: { silent: true },
    mutationFn: async (meses: number) => api.put(routes.ambiental.retencion, { body: { periodo_retencion_meses: meses } }),
    onSuccess: () => toast("success", t("saved")),
    onError: (e) => e instanceof ApiError && setError(e.fieldErrors().periodo_retencion_meses ?? e.message),
  });
  return (
    <form className="flex max-w-xl flex-wrap items-end gap-4" noValidate onSubmit={(e) => { e.preventDefault(); const n = Number(new FormData(e.currentTarget).get("meses")); if (!(n >= 6)) return setError(t("min")); setError(undefined); save.mutate(n); }}>
      <TextField label={t("months")} name="meses" type="number" min={6} defaultValue={12} hint={t("hint")} error={error} required className="w-56" />
      <Button type="submit" loading={save.isPending}>{t("save")}</Button>
    </form>
  );
}

export function EnvironmentAdminView() {
  const t = useTranslations("admin.environment");
  const tc = useTranslations("common");
  const locale = useLocale();
  const lista = useAtractivos();
  const [selected, setSelected] = useState("");
  useDocumentTitle(t("title"));
  const id = selected || lista.data?.[0]?.id || "";
  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        <div className="mb-8 max-w-md">
          <SelectField label={t("attraction")} name="atractivo" value={id} onChange={(e) => setSelected(e.target.value)}>
            {lista.data?.map((a) => <option key={a.id} value={a.id}>{localized(a.nombre, locale)}</option>)}
          </SelectField>
        </div>
        {lista.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {id && (
          <Tabs key={id} label={t("title")} tabs={[
            { id: "capacidad", label: t("tabs.capacity"), content: <CapacityTab id={id} /> },
            { id: "conflicto", label: t("tabs.conflict"), content: <ConflictTab id={id} /> },
            { id: "ocupacion", label: t("tabs.occupancy"), content: <OccupancyTab id={id} /> },
            { id: "historico", label: t("tabs.history"), content: <HistoryTab id={id} /> },
            { id: "practicas", label: t("tabs.practices"), content: <GoodPracticesTab id={id} /> },
          ]} />
        )}
        <section aria-labelledby="ret" className="mt-14"><h2 id="ret" className="border-t-2 border-ink pt-4 !text-2xl">{t("retention.title")}</h2><p className="mb-4 mt-1 text-ink/80">{t("retention.description")}</p><RetentionPanel /></section>
      </Container>
    </>
  );
}

// ── Monitoreo (IU-04): salud M1, alertas M8, pipeline M9 ────────────────────────────────────────
function ServicesTab() {
  const t = useTranslations("admin.monitoring.services");
  const tc = useTranslations("common");
  const locale = useLocale();
  const q = useQuery({ queryKey: ["m1", "estado"], refetchInterval: 30_000, queryFn: async () => (await api.get<{ generado_en: string; servicios: { nombre: string; estado: string; latencia_ms: number | null }[] }>(routes.estadoServicios)).data });
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  const bad = q.data.servicios.filter((s) => s.estado !== "OPERATIVO").length;
  return (
    <>
      <MetricRibbon label={t("title")} items={[{ label: t("total"), value: q.data.servicios.length }, { label: t("operational"), value: q.data.servicios.length - bad }, { label: t("issues"), value: bad }]} />
      <p className="meta mt-3">{t("updated", { date: formatDateTime(q.data.generado_en, locale) })}</p>
      <div className="mt-4"><EditorialTable caption={t("title")} rows={q.data.servicios} rowKey={(s) => s.nombre} columns={[
        { key: "n", header: t("service"), cell: (s) => <strong>{s.nombre}</strong> },
        { key: "e", header: tc("status"), cell: (s) => <StatusTag tone={s.estado === "OPERATIVO" ? "good" : s.estado === "DEGRADADO" ? "warn" : "bad"}>{t(`states.${s.estado}`)}</StatusTag> },
        { key: "l", header: t("latency"), align: "right", cell: (s) => (s.latencia_ms == null ? "—" : `${s.latencia_ms} ms`) },
      ]} /></div>
    </>
  );
}

function AlertsTab() {
  const t = useTranslations("admin.monitoring.alerts");
  const tc = useTranslations("common");
  const locale = useLocale();
  const qc = useQueryClient();
  const [estado, setEstado] = useState("ACTIVA");
  const [page, setPage] = useState(0);
  const [panel, setPanel] = useState<{ alert: AlertaAmbiental; action: "reconocimiento" | "cierre" } | null>(null);
  const [error, setError] = useState<string>();
  const q = useQuery({ queryKey: ["m8", "alertas", estado, page], queryFn: async () => (await api.get<PageResponse<AlertaAmbiental>>(routes.ambiental.alertas, { query: { estado, page, size: 10 } })).data });
  const act = useMutation({
    meta: { silent: true },
    mutationFn: async ({ id, action }: { id: string; action: "reconocimiento" | "cierre" }) => api.post(action === "cierre" ? routes.ambiental.alertaCierre(id) : routes.ambiental.alertaReconocimiento(id)),
    onSuccess: (_d, v) => { toast("success", t(`done.${v.action}`)); setPanel(null); setError(undefined); qc.invalidateQueries({ queryKey: ["m8", "alertas"] }); },
    onError: (e) => e instanceof ApiError && setError(e.status === 409 ? t("mustAcknowledge") : e.message),
  });
  return (
    <div>
      <div className="mb-4 max-w-xs"><SelectField label={t("filter")} name="estado" value={estado} onChange={(e) => { setEstado(e.target.value); setPage(0); }}>{["ACTIVA", "RECONOCIDA", "CERRADA", "TODAS"].map((s) => <option key={s} value={s}>{t(`states.${s}`)}</option>)}</SelectField></div>
      {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
      {q.data && (
        <>
          <EditorialTable caption={t("title")} rows={q.data.content} rowKey={(a) => a.id} empty={t("empty")} columns={[
            { key: "a", header: t("attraction"), cell: (a) => <strong>{a.atractivo_ref}</strong> },
            { key: "t", header: t("type"), cell: (a) => <StatusTag tone={a.tipo === "CRITICA" ? "bad" : "warn"}>{t(`types.${a.tipo}`)}</StatusTag> },
            { key: "o", header: t("occupancy"), align: "right", cell: (a) => (a.ocupacion == null ? "—" : `${a.ocupacion} %`) },
            { key: "f", header: tc("date"), cell: (a) => formatDateTime(a.fecha, locale) },
            { key: "e", header: tc("status"), cell: (a) => t(`states.${a.estado}`) }, { key: "r", header: t("responsible"), cell: (a) => a.usuario_responsable ?? "—" },
            { key: "x", header: <span className="sr-only">{tc("actions")}</span>, cell: (a) => a.estado !== "CERRADA" && <button type="button" className="text-link font-semibold" onClick={() => { setPanel({ alert: a, action: a.estado === "ACTIVA" ? "reconocimiento" : "cierre" }); setError(undefined); }}>{a.estado === "ACTIVA" ? t("acknowledge") : t("close")}<span className="sr-only"> {a.atractivo_ref}</span></button> },
          ]} />
          <Pagination page={page} pageSize={10} total={q.data.totalElements ?? q.data.total_elements ?? 0} onChange={setPage} />
        </>
      )}
      <SlideOver open={panel !== null} onClose={() => setPanel(null)} title={panel ? t(`panel.${panel.action}`) : ""}>
        {panel && (
          <div className="space-y-5">
            <p>{t("panelText", { attraction: panel.alert.atractivo_ref ?? "", type: t(`types.${panel.alert.tipo}`) })}</p>
            {error && <p role="alert" className="font-medium text-critical">{error}</p>}
            <div className="flex gap-3"><Button loading={act.isPending} onClick={() => act.mutate({ id: panel.alert.id, action: panel.action })}>{tc("confirm")}</Button><Button variant="secondary" onClick={() => setPanel(null)}>{tc("cancel")}</Button></div>
          </div>
        )}
      </SlideOver>
    </div>
  );
}

export function MonitoringView() {
  const t = useTranslations("admin.monitoring");
  useDocumentTitle(t("title"));
  return (
    <RequireRole area="monitoreo">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8"><Tabs label={t("title")} tabs={[
        { id: "servicios", label: t("tabs.services"), content: <ServicesTab /> },
        { id: "alertas", label: t("tabs.alerts"), content: <AlertsTab /> },
        { id: "pipeline", label: t("tabs.pipeline"), content: <PipelinePanel /> },
      ]} /></Container>
    </RequireRole>
  );
}
