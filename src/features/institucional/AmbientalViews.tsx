"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/core/api/errorNormalizer";
import { api } from "@/core/api/gatewayClient";
import { routes } from "@/core/api/routes";
import { toList, type AlertaAmbiental, type ConfiguracionCapacidad, type PageResponse, type ResultadoBusqueda } from "@/core/api/types";
import { RequireRole } from "@/core/auth/RequireRole";
import { formatDate, formatDateTime, localized, rangoDias } from "@/core/format";
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
  // 404 = el atractivo aún no tiene configuración: se crea con POST; las siguientes versiones con PUT (M8).
  const q = useQuery({
    queryKey: ["m8", "capacidad", id],
    queryFn: async (): Promise<ConfiguracionCapacidad | null> => {
      try {
        return (await api.get<ConfiguracionCapacidad>(routes.ambiental.capacidad(id))).data;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null;
        throw e;
      }
    },
  });
  const existe = !!q.data;
  // M8: versiones paginadas (`VersionConfiguracionResponse`) y auditoría como lista de `CambioConfiguracionResponse`.
  const versions = useQuery({
    queryKey: ["m8", "versiones", id],
    enabled: existe,
    queryFn: async () => toList<{ version: number; fecha_creacion?: string; responsable?: string; vigencia_desde?: string; vigencia_hasta?: string }>((await api.get(routes.ambiental.capacidadVersiones(id))).data).items,
  });
  const log = useQuery({
    queryKey: ["m8", "cambios", id],
    enabled: existe,
    queryFn: async () => (await api.get<{ campo: string; valor_anterior?: string | null; valor_modificado?: string | null; usuario?: string; fecha?: string; hora?: string; version_resultante: number }[]>(routes.ambiental.capacidadAuditoria(id))).data,
  });
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [restrict, setRestrict] = useState<boolean | null>(null);
  const save = useMutation({
    meta: { silent: true },
    mutationFn: async (body: Partial<ConfiguracionCapacidad>) =>
      (existe
        ? await api.put<ConfiguracionCapacidad>(routes.ambiental.capacidad(id), { body })
        : await api.post<ConfiguracionCapacidad>(routes.ambiental.capacidad(id), { body })
      ).data,
    onSuccess: (d) => { toast("success", t("saved", { version: d.version ?? 0 })); setErrors({}); qc.invalidateQueries({ queryKey: ["m8"] }); },
    onError: (e) => e instanceof ApiError && setErrors({ ...e.fieldErrors(), ...(Object.keys(e.fieldErrors()).length ? {} : { form: e.message }) }),
  });

  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  const hoy = new Date().toISOString().slice(0, 10);
  const enUnAnio = new Date(Date.now() + 365 * 86_400_000).toISOString().slice(0, 10);
  const c: Partial<ConfiguracionCapacidad> = q.data ?? { umbral_recomendacion: 80, umbral_preventivo: 85, umbral_critico: 90, vigencia_desde: hoy, vigencia_hasta: enUnAnio, restriccion_reservas: false };
  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => Number(f.get(k));
    const s = (k: string) => String(f.get(k) ?? "").trim();
    const next: Record<string, string> = {};
    if (!(n("capacidad_carga") > 0)) next.capacidad_carga = t("positive");
    if (n("umbral_preventivo") <= n("umbral_recomendacion")) next.umbral_preventivo = t("order.preventive");
    if (n("umbral_critico") <= n("umbral_preventivo")) next.umbral_critico = t("order.critical");
    // M8 (`ConfiguracionRequest`) exige fuente del criterio, vigencia y responsable.
    for (const k of ["fuente_criterio", "vigencia_desde", "vigencia_hasta", "responsable"]) if (!s(k)) next[k] = t("required");
    if (s("vigencia_desde") && s("vigencia_hasta") && s("vigencia_hasta") < s("vigencia_desde")) next.vigencia_hasta = t("order.validity");
    setErrors(next);
    if (Object.keys(next).length) return;
    save.mutate({
      capacidad_carga: n("capacidad_carga"), umbral_recomendacion: n("umbral_recomendacion"), umbral_preventivo: n("umbral_preventivo"), umbral_critico: n("umbral_critico"),
      fuente_criterio: s("fuente_criterio"), vigencia_desde: s("vigencia_desde"), vigencia_hasta: s("vigencia_hasta"), responsable: s("responsable"),
      restriccion_reservas: restrict ?? c.restriccion_reservas ?? false,
    });
  };

  return (
    <div className="space-y-10">
      {c.criterio_vencido && <p role="alert" className="border-l-4 border-critical pl-3 font-semibold text-critical">{t("expired")}</p>}
      <form key={c.version ?? "nueva"} onSubmit={onSubmit} noValidate className="max-w-3xl space-y-6">
        <ErrorSummary errors={errors} title={tc("errorSummary")} />
        {existe
          ? <p className="meta">{t("currentVersion", { version: c.version ?? 1, user: c.responsable ?? "—" })}</p>
          : <p role="status" className="border-l-4 border-ink pl-3">{t("notConfigured")}</p>}
        <div className="grid gap-6 sm:grid-cols-2">
          <TextField label={t("capacity")} name="capacidad_carga" type="number" min={1} defaultValue={c.capacidad_carga} error={errors.capacidad_carga} required />
          <TextField label={t("source")} name="fuente_criterio" defaultValue={c.fuente_criterio} error={errors.fuente_criterio} required />
          <TextField label={t("responsible")} name="responsable" defaultValue={c.responsable} error={errors.responsable} required />
          <TextField label={t("recommendation")} name="umbral_recomendacion" type="number" min={0} max={100} defaultValue={c.umbral_recomendacion} error={errors.umbral_recomendacion} required />
          <TextField label={t("preventive")} name="umbral_preventivo" type="number" min={0} max={100} defaultValue={c.umbral_preventivo} error={errors.umbral_preventivo} required />
          <TextField label={t("critical")} name="umbral_critico" type="number" min={0} max={100} defaultValue={c.umbral_critico} error={errors.umbral_critico} required />
          <TextField label={t("validFrom")} name="vigencia_desde" type="date" defaultValue={c.vigencia_desde} error={errors.vigencia_desde} required />
          <TextField label={t("validTo")} name="vigencia_hasta" type="date" defaultValue={c.vigencia_hasta} error={errors.vigencia_hasta} required />
        </div>
        <SwitchField label={t("restrict")} name="restriccion" hint={t("restrictHint")} checked={restrict ?? c.restriccion_reservas ?? false} onChange={setRestrict} />
        {errors.form && <p role="alert" className="font-medium text-critical">{errors.form}</p>}
        <p className="text-sm">{t("immutable")}</p>
        <Button type="submit" loading={save.isPending}>{t("publishVersion")}</Button>
      </form>

      <section aria-labelledby="versions"><h3 id="versions" className="border-t-2 border-ink pt-4 !text-xl">{t("versions")}</h3>
        {versions.data && <EditorialTable caption={t("versions")} rows={versions.data} rowKey={(v) => String(v.version)} columns={[
          { key: "v", header: "v", align: "right", cell: (v) => v.version },
          { key: "c", header: tc("date"), cell: (v) => formatDateTime(v.fecha_creacion, locale) },
          { key: "d", header: t("validity"), cell: (v) => `${formatDate(v.vigencia_desde, locale)} → ${formatDate(v.vigencia_hasta, locale)}` }, { key: "r", header: t("responsible"), cell: (v) => v.responsable },
        ]} />}
      </section>
      <section aria-labelledby="changes"><h3 id="changes" className="border-t-2 border-ink pt-4 !text-xl">{t("changes")}</h3>
        {log.data && <EditorialTable caption={t("changes")} rows={log.data} empty={t("noChanges")} rowKey={(r) => `${r.version_resultante}-${r.campo}`} columns={[
          { key: "v", header: "v", align: "right", cell: (r) => r.version_resultante }, { key: "f", header: t("field"), cell: (r) => r.campo },
          { key: "a", header: t("before"), cell: (r) => r.valor_anterior ?? "—" }, { key: "d", header: t("after"), cell: (r) => r.valor_modificado ?? "—" },
          { key: "t", header: tc("date"), cell: (r) => `${formatDate(r.fecha, locale)}${r.hora ? ` ${r.hora.slice(0, 5)}` : ""}` }, { key: "u", header: t("responsible"), cell: (r) => r.usuario ?? "—" },
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
  // M8 `OcupacionResponse`: valor (%), ventana_movil_minutos e insumos del ciclo como contadores.
  type Ocupacion = {
    valor: number | string; ventana_movil_minutos: number; insumo_reservas: number; insumo_consultas: number;
    insumo_disponibilidad: number; insumo_fuentes_externas: number; ajuste_no_show?: number | string | null; marca_temporal?: string;
  };
  const q = useQuery({
    queryKey: ["m8", "ocupacion", id],
    queryFn: async (): Promise<Ocupacion | null> => {
      try {
        return (await api.get<Ocupacion>(routes.ambiental.ocupacion(id))).data;
      } catch (e) {
        if (e instanceof ApiError && e.status === 404) return null; // sin capacidad configurada / sin ciclo vigente
        throw e;
      }
    },
  });
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  if (!q.data) return <StatusBlock kind="empty" title={t("none")} />;
  const o = q.data;
  const insumos = [
    { nombre: t("inputsNames.reservas"), valor: o.insumo_reservas },
    { nombre: t("inputsNames.consultas"), valor: o.insumo_consultas },
    { nombre: t("inputsNames.disponibilidad"), valor: o.insumo_disponibilidad },
    { nombre: t("inputsNames.fuentes"), valor: o.insumo_fuentes_externas },
  ];
  return (
    <>
      <MetricRibbon label={t("title")} items={[{ label: t("estimated"), value: `${Math.round(Number(o.valor))} %` }, { label: t("window"), value: `${o.ventana_movil_minutos} min` }]} />
      <div className="mt-6"><EditorialTable caption={t("inputs")} rows={insumos} rowKey={(i) => i.nombre} columns={[
        { key: "n", header: t("input"), cell: (i) => i.nombre }, { key: "v", header: t("value"), align: "right", cell: (i) => i.valor },
      ]} /></div>
    </>
  );
}

function HistoryTab({ id }: { id: string }) {
  const t = useTranslations("admin.environment.history");
  const tc = useTranslations("common");
  // M8 exige `desde` y `hasta` (fechas ISO): por defecto, los últimos 6 meses.
  const [range, setRange] = useState(() => rangoDias(180));
  // M8 `HistoricoSostenibilidadResponse`: ocupacion_estimada[{ valor, marca_temporal, ciclo_id }] por ciclo de monitoreo.
  const q = useQuery({
    queryKey: ["m8", "historico", id, range],
    queryFn: async () => {
      const d = (await api.get<{ ocupacion_estimada?: { valor: number | string; marca_temporal: string }[] }>(routes.ambiental.historico(id), { query: range })).data;
      // Promedio diario de los ciclos (la gráfica muestra la tendencia, no cada ciclo de 15 s).
      const porDia = new Map<string, number[]>();
      for (const o of d.ocupacion_estimada ?? []) {
        const dia = o.marca_temporal.slice(0, 10);
        porDia.set(dia, [...(porDia.get(dia) ?? []), Number(o.valor)]);
      }
      return { serie: [...porDia.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([fecha, v]) => ({ fecha, ocupacion_promedio: Math.round((v.reduce((s, x) => s + x, 0) / v.length) * 10) / 10 })) };
    },
  });
  return (
    <div className="space-y-6">
      <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); const desde = String(f.get("desde") ?? ""); const hasta = String(f.get("hasta") ?? ""); if (desde && hasta) setRange({ desde, hasta }); }}>
        <TextField label={t("from")} name="desde" type="date" defaultValue={range.desde} required /><TextField label={t("to")} name="hasta" type="date" defaultValue={range.hasta} required /><Button type="submit">{t("apply")}</Button>
      </form>
      {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
      {q.data && <TrendChart label={t("chart")} valueLabel={t("occupancy")} format={(n) => `${n} %`} data={q.data.serie.map((s) => ({ x: s.fecha.slice(5), y: s.ocupacion_promedio }))} />}
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
  // M1 (`EstadoServicio`): { servicios: [{ servicio, salud: SANO|DEGRADADO|CAIDO, latencia_ms, ultima_verificacion }] }.
  const q = useQuery({ queryKey: ["m1", "estado"], refetchInterval: 30_000, queryFn: async () => (await api.get<{ servicios: { servicio: string; salud: string; latencia_ms: number | null; ultima_verificacion?: string }[] }>(routes.estadoServicios)).data });
  if (q.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (q.isError) return <ErrorNotice error={q.error} referenceLabel={tc("reference")} />;
  const bad = q.data.servicios.filter((s) => s.salud !== "SANO").length;
  const ultima = q.data.servicios.map((s) => s.ultima_verificacion).filter(Boolean).sort().at(-1);
  return (
    <>
      <MetricRibbon label={t("title")} items={[{ label: t("total"), value: q.data.servicios.length }, { label: t("operational"), value: q.data.servicios.length - bad }, { label: t("issues"), value: bad }]} />
      {ultima && <p className="meta mt-3">{t("updated", { date: formatDateTime(ultima, locale) })}</p>}
      <div className="mt-4"><EditorialTable caption={t("title")} rows={q.data.servicios} rowKey={(s) => s.servicio} columns={[
        { key: "n", header: t("service"), cell: (s) => <strong>{s.servicio}</strong> },
        { key: "e", header: tc("status"), cell: (s) => <StatusTag tone={s.salud === "SANO" ? "good" : s.salud === "DEGRADADO" ? "warn" : "bad"}>{t.has(`states.${s.salud}`) ? t(`states.${s.salud}`) : s.salud}</StatusTag> },
        { key: "l", header: t("latency"), align: "right", cell: (s) => (s.latencia_ms == null || s.latencia_ms < 0 ? "—" : `${s.latencia_ms} ms`) },
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
          <EditorialTable caption={t("title")} rows={q.data.content} rowKey={(a) => String(a.id)} empty={t("empty")} columns={[
            { key: "a", header: t("attraction"), cell: (a) => <strong>{a.atractivo_ref}</strong> },
            { key: "t", header: t("type"), cell: (a) => <StatusTag tone={a.tipo === "CRITICA" ? "bad" : "warn"}>{t(`types.${a.tipo}`)}</StatusTag> },
            { key: "o", header: t("occupancy"), align: "right", cell: (a) => (a.ocupacion_al_cruce == null ? "—" : `${Math.round(Number(a.ocupacion_al_cruce))} %`) },
            { key: "f", header: tc("date"), cell: (a) => formatDateTime(a.marca_temporal_activacion, locale) },
            { key: "e", header: tc("status"), cell: (a) => t(`states.${a.estado}`) }, { key: "r", header: t("responsible"), cell: (a) => a.usuario_cierre ?? a.usuario_reconocimiento ?? a.usuario_responsable ?? "—" },
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
            <div className="flex gap-3"><Button loading={act.isPending} onClick={() => act.mutate({ id: String(panel.alert.id), action: panel.action })}>{tc("confirm")}</Button><Button variant="secondary" onClick={() => setPanel(null)}>{tc("cancel")}</Button></div>
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
