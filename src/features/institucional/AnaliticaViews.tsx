"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useMutation, useQuery } from "@tanstack/react-query";
import { ApiError } from "@/core/api/errorNormalizer";
import { api } from "@/core/api/gatewayClient";
import { routes } from "@/core/api/routes";
import type { IndicadoresDemanda, IndicadorAmbiental, JobExportacion, MapaCalor, SerieDashboard, TasaOcupacion } from "@/core/api/types";
import { RequireRole } from "@/core/auth/RequireRole";
import { formatDateTime, formatNumber, rangoMensual } from "@/core/format";
import { useSessionStore } from "@/core/auth/sessionStore";
import { usePrestadoresAdmin } from "@/features/institucional/AdminViews";
import { saveBlob } from "@/features/reservas/api";
import { useUiStore } from "@/core/store/uiStore";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { Heatmap, RankBars, TrendChart } from "@/shared/ui/charts";
import { EditorialTable } from "@/shared/ui/EditorialTable";
import { SelectField, TextField } from "@/shared/ui/forms";
import { ProgressBar, SustainabilityIndicator, levelFromOccupancy } from "@/shared/ui/indicators";
import { Container, MetricRibbon, PageHeader } from "@/shared/ui/layout";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";

const quarters = () => {
  const now = new Date();
  const out: string[] = [];
  let y = now.getFullYear();
  let q = Math.floor(now.getMonth() / 3) + 1;
  for (let i = 0; i < 6; i++) {
    out.push(`${y}-Q${q}`);
    if (--q === 0) { q = 4; y--; }
  }
  return out;
};
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const months = () => Array.from({ length: 6 }, (_, i) => { const d = new Date(); d.setMonth(d.getMonth() - i); return d.toISOString().slice(0, 7); });

// ── Gestor de exportaciones asíncronas (guía §3.6) ──────────────────────────────────────────────
function ExportManager({ periodo }: { periodo: string }) {
  const t = useTranslations("analitica.export");
  const tc = useTranslations("common");
  const [jobId, setJobId] = useState<string | null>(null);
  const [formato, setFormato] = useState<"PDF" | "CSV">("PDF");
  const [downloadError, setDownloadError] = useState<string>();

  const create = useMutation({
    mutationFn: async () => (await api.post<JobExportacion>(routes.reportes.exportaciones, { body: { formato, filtros: { periodo, indicadores: ["atractivos_mas_consultados", "actividades_mas_reservadas", "periodos_alta_demanda"], prestador: null } } })).data,
    onSuccess: (job) => { setJobId(job.job_id); setDownloadError(undefined); },
  });

  // Polling cada 2 s hasta DISPONIBLE / FALLIDO (React Query refetchInterval).
  const job = useQuery({
    queryKey: ["m9", "exportacion", jobId],
    enabled: !!jobId,
    queryFn: async () => (await api.get<JobExportacion>(routes.reportes.exportacion(jobId!))).data,
    refetchInterval: (q) => (q.state.data && ["DISPONIBLE", "FALLIDO"].includes(q.state.data.estado) ? false : 2000),
  });
  const estado = job.data?.estado ?? (create.isPending ? "ENCOLADO" : null);
  const progress = estado === "ENCOLADO" ? 15 : estado === "GENERANDO" ? 60 : estado === "DISPONIBLE" ? 100 : 0;

  const download = async () => {
    try {
      const { data } = await api.get<Blob>(routes.reportes.exportacionDescarga(jobId!));
      saveBlob(data, `reporte-${periodo}.${formato.toLowerCase()}`);
    } catch (e) {
      setDownloadError(e instanceof ApiError && e.status === 410 ? t("expired") : e instanceof Error ? e.message : t("failed"));
    }
  };

  return (
    <section aria-labelledby="export-title" className="mx-auto max-w-7xl px-4 pb-10 sm:px-6 lg:px-8">
      <div className="card space-y-4 p-5 sm:p-6">
        <h2 id="export-title" className="!text-2xl">{t("title")}</h2>
        <div className="flex flex-wrap items-end gap-4">
          <SelectField label={t("format")} name="formato" value={formato} onChange={(e) => setFormato(e.target.value as "PDF" | "CSV")}><option value="PDF">PDF</option><option value="CSV">CSV</option></SelectField>
          <Button onClick={() => create.mutate()} loading={create.isPending} disabled={estado === "ENCOLADO" || estado === "GENERANDO"}>{t("request", { format: formato })}</Button>
        </div>
        <div aria-live="polite">
          {(estado === "ENCOLADO" || estado === "GENERANDO") && <ProgressBar label={t(`states.${estado}`)} value={progress} />}
          {estado === "FALLIDO" && <p role="alert" className="font-semibold text-critical">{t("failed")}</p>}
          {estado === "DISPONIBLE" && (
            <div className="flex flex-wrap items-center gap-4">
              {/* Esmeralda original: botón con texto grande y en negrita (3,99:1, WCAG texto grande). */}
              <Button variant="emerald" onClick={download}>{t("download")}</Button>
              {job.data?.fecha_expiracion && <span className="meta">{t("expires", { date: formatDateTime(job.data.fecha_expiracion, "es-CO") })}</span>}
            </div>
          )}
          {downloadError && <p role="alert" className="mt-2 font-medium text-critical">{downloadError}</p>}
          {create.isError && <ErrorNotice error={create.error} referenceLabel={tc("reference")} />}
        </div>
      </div>
    </section>
  );
}

// ── Analítica (ANALISTA_TURISTICO / ADMINISTRADOR) ──────────────────────────────────────────────
export function AnalyticsView() {
  const t = useTranslations("analitica");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [periodo, setPeriodo] = useState(quarters()[1] ?? quarters()[0]);
  const [comparar, setComparar] = useState("");
  const [mes, setMes] = useState(months()[1] ?? months()[0]);
  // M9 exige `prestador` en la tasa de ocupación para ADMINISTRADOR/ANALISTA (el PRESTADOR la ve por su token).
  const [prestador, setPrestador] = useState("");
  const rol = useSessionStore((s) => s.user?.rol);
  const aprobados = usePrestadoresAdmin("aprobado", undefined, 1, rol === "ADMINISTRADOR");
  useDocumentTitle(t("title"));

  const demanda = useQuery({ queryKey: ["m9", "demanda", periodo, comparar], queryFn: async () => (await api.get<IndicadoresDemanda>(routes.reportes.demanda, { query: { periodo, compararCon: comparar || undefined, topN: 6 } })).data });
  const ocupacion = useQuery({
    queryKey: ["m9", "ocupacion", mes, prestador],
    enabled: UUID_RE.test(prestador),
    queryFn: async () => (await api.get<TasaOcupacion>(routes.reportes.ocupacion, { query: { prestador, periodo: mes, compararCon: months().find((m) => m < mes) } })).data,
  });
  // LINEA_TENDENCIA exige `desde` y `hasta` mensuales (M9).
  const tendencia = useQuery({ queryKey: ["m9", "tendencia"], queryFn: async () => (await api.get<SerieDashboard>(routes.reportes.series, { query: { indicador: "reservas_por_periodo", tipo: "LINEA_TENDENCIA", ...rangoMensual(6) } })).data });
  const calor = useQuery({ queryKey: ["m9", "calor", periodo], queryFn: async () => (await api.get<MapaCalor>(routes.reportes.mapaCalor, { query: { periodo } })).data });

  const d = demanda.data;
  return (
    <RequireRole area="analitica">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-6">
        <form className="flex flex-wrap items-end gap-4" onSubmit={(e) => e.preventDefault()}>
          <SelectField label={t("period")} name="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>{quarters().map((q) => <option key={q} value={q}>{q}</option>)}</SelectField>
          <SelectField label={t("compareWith")} name="comparar" value={comparar} onChange={(e) => setComparar(e.target.value)}><option value="">{t("none")}</option>{quarters().filter((q) => q !== periodo).map((q) => <option key={q} value={q}>{q}</option>)}</SelectField>
          <SelectField label={t("month")} name="mes" value={mes} onChange={(e) => setMes(e.target.value)}>{months().map((m) => <option key={m} value={m}>{m}</option>)}</SelectField>
          {rol === "ADMINISTRADOR" ? (
            <SelectField label={t("occupancy.provider")} name="prestador" value={prestador} onChange={(e) => setPrestador(e.target.value)}>
              <option value="">{t("occupancy.chooseProvider")}</option>
              {(aprobados.data?.items ?? []).map((p) => <option key={p.id} value={p.id}>{p.nombre_comercial ?? p.razon_social}</option>)}
            </SelectField>
          ) : (
            <TextField label={t("occupancy.providerId")} name="prestador" value={prestador} onChange={(e) => setPrestador(e.target.value.trim())} hint={t("occupancy.providerIdHint")} />
          )}
        </form>
      </Container>
      {!UUID_RE.test(prestador) && <Container><p className="border-l-4 border-ink pl-3 text-sm">{t("occupancy.needProvider")}</p></Container>}
      {ocupacion.isError && <Container><ErrorNotice error={ocupacion.error} referenceLabel={tc("reference")} /></Container>}

      {ocupacion.data && (
        <MetricRibbon label={t("occupancy.title")} items={[
          { label: t("occupancy.rate"), value: `${ocupacion.data.tasa_ocupacion} %`, delta: ocupacion.data.comparativa?.variacion },
          { label: t("occupancy.base"), value: formatNumber(ocupacion.data.base_reservas_confirmadas_pasadas ?? 0, locale) },
          ...(d ? [{ label: t("demand.topConsulted"), value: formatNumber(d.atractivos_mas_consultados[0]?.valor ?? 0, locale) }] : []),
        ]} />
      )}

      <Container className="space-y-6 py-8">
        {(demanda.isPending) && <StatusBlock kind="loading" title={tc("loading")} />}
        {demanda.isError && <ErrorNotice error={demanda.error} referenceLabel={tc("reference")} />}
        {d && (
          <>
            <section aria-labelledby="top1" className="card p-5 sm:p-6 card p-5 sm:p-6"><h2 id="top1" className="mb-1 !text-2xl">{t("demand.attractions")}</h2>
              <div className="mt-3"><RankBars caption={t("demand.attractions")} labelHeader={t("demand.label")} valueHeader={t("demand.consultations")} format={(n) => formatNumber(n, locale)} rows={d.atractivos_mas_consultados.map((r) => ({ key: r.referencia, label: r.etiqueta, value: r.valor, note: r.variacion == null ? null : String(r.variacion) }))} /></div>
            </section>
            <section aria-labelledby="top2" className="card p-5 sm:p-6 card p-5 sm:p-6"><h2 id="top2" className="mb-1 !text-2xl">{t("demand.activities")}</h2>
              <div className="mt-3"><RankBars caption={t("demand.activities")} labelHeader={t("demand.label")} valueHeader={t("demand.bookings")} format={(n) => formatNumber(n, locale)} rows={d.actividades_mas_reservadas.map((r) => ({ key: r.referencia, label: r.etiqueta, value: r.valor, note: r.variacion == null ? null : String(r.variacion) }))} /></div>
            </section>
            {d.periodos_alta_demanda && d.periodos_alta_demanda.length > 0 && (
              <section aria-labelledby="peak" className="card p-5 sm:p-6 card p-5 sm:p-6"><h2 id="peak" className="mb-1 !text-2xl">{t("demand.peaks")}</h2>
                <div className="mt-3"><RankBars caption={t("demand.peaks")} labelHeader={t("demand.label")} valueHeader={t("demand.bookings")} format={(n) => formatNumber(n, locale)} rows={d.periodos_alta_demanda.map((p) => ({ key: p.periodo, label: p.periodo, value: p.valor }))} /></div>
              </section>
            )}
          </>
        )}
        {tendencia.data && (
          <section aria-labelledby="trend" className="card p-5 sm:p-6 card p-5 sm:p-6"><h2 id="trend" className="mb-1 !text-2xl">{t("trend.title")}</h2>
            <div className="mt-4"><TrendChart label={t("trend.chart")} valueLabel={t("trend.value")} data={tendencia.data.puntos.map((p) => ({ x: (p.periodo ?? p.etiqueta ?? "").slice(5), y: p.valor }))} /></div>
          </section>
        )}
        {calor.data && (
          <section aria-labelledby="heat" className="card p-5 sm:p-6 card p-5 sm:p-6"><h2 id="heat" className="mb-1 !text-2xl">{t("heat.title")}</h2><p className="mb-3 mt-1 text-ink/80">{t("heat.description", { tz: calor.data.zona_horaria ?? "America/Bogota" })}</p>
            <Heatmap caption={t("heat.title")} rowHeader={t("heat.attraction")} cells={calor.data.celdas.map((c) => ({ row: c.etiqueta, col: c.subperiodo, value: c.intensidad }))} />
          </section>
        )}
      </Container>
      <ExportManager periodo={periodo} />
    </RequireRole>
  );
}

// ── Sostenibilidad (AUTORIDAD_AMBIENTAL: solo lectura agregada, CU-28) ──────────────────────────
export function SustainabilityView() {
  const t = useTranslations("analitica.sustainability");
  const tc = useTranslations("common");
  const [periodo, setPeriodo] = useState(quarters()[1] ?? quarters()[0]);
  useDocumentTitle(t("title"));
  const q = useQuery({ queryKey: ["m9", "sostenibilidad", periodo], queryFn: async () => (await api.get<{ periodo: string; zona_horaria: string; indicadores: IndicadorAmbiental[] }>(routes.reportes.sostenibilidad, { query: { periodo } })).data });
  const rows = q.data?.indicadores ?? [];
  const critical = rows.reduce((n, r) => n + r.alertas_del_periodo.criticas, 0);
  const preventive = rows.reduce((n, r) => n + r.alertas_del_periodo.preventivas, 0);
  const peak = Math.max(0, ...rows.map((r) => r.ocupacion_estimada_consolidada.maximo));

  return (
    <RequireRole area="sostenibilidad">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-6"><div className="max-w-xs"><SelectField label={t("period")} name="periodo" value={periodo} onChange={(e) => setPeriodo(e.target.value)}>{quarters().map((x) => <option key={x} value={x}>{x}</option>)}</SelectField></div></Container>
      {q.isPending && <Container><StatusBlock kind="loading" title={tc("loading")} /></Container>}
      {q.isError && <Container><ErrorNotice error={q.error} referenceLabel={tc("reference")} /></Container>}
      {q.data && (
        <>
          <MetricRibbon label={t("title")} items={[{ label: t("attractions"), value: rows.length }, { label: t("peak"), value: `${peak} %` }, { label: t("preventive"), value: preventive }, { label: t("critical"), value: critical }]} />
          <Container className="space-y-6 py-8">
            <section aria-labelledby="ind" className="card p-5 sm:p-6 card p-5 sm:p-6"><h2 id="ind" className="mb-1 !text-2xl">{t("indicators")}</h2><p className="mb-3 mt-1 text-sm text-ink/80">{t("aggregateNote", { tz: q.data.zona_horaria })}</p>
              <EditorialTable caption={t("indicators")} rows={rows} rowKey={(r) => r.atractivo_ref} columns={[
                { key: "n", header: t("attraction"), cell: (r) => <strong>{r.etiqueta_atractivo ?? r.atractivo_ref}</strong> },
                { key: "o", header: t("occupancy"), cell: (r) => <SustainabilityIndicator level={levelFromOccupancy(r.ocupacion_estimada_consolidada.maximo)} occupancy={r.ocupacion_estimada_consolidada.maximo} /> },
                { key: "a", header: t("average"), align: "right", cell: (r) => `${r.ocupacion_estimada_consolidada.promedio} %` },
                { key: "p", header: t("preventive"), align: "right", cell: (r) => r.alertas_del_periodo.preventivas }, { key: "c", header: t("critical"), align: "right", cell: (r) => r.alertas_del_periodo.criticas },
              ]} />
            </section>
            <section aria-labelledby="flow" className="card p-5 sm:p-6 card p-5 sm:p-6"><h2 id="flow" className="mb-1 !text-2xl">{t("flow")}</h2>
              <div className="mt-3"><Heatmap caption={t("flow")} rowHeader={t("attraction")} cells={rows.flatMap((r) => Object.entries(r.distribucion_flujo_turistico).map(([col, value]) => ({ row: r.etiqueta_atractivo ?? r.atractivo_ref, col, value })))} /></div>
            </section>
          </Container>
        </>
      )}
    </RequireRole>
  );
}

// ── Pipeline de M9 (estado de colas + replay) ───────────────────────────────────────────────────
export function PipelinePanel() {
  const t = useTranslations("analitica.pipeline");
  const tc = useTranslations("common");
  const locale = useLocale();
  const q = useQuery({ queryKey: ["m9", "pipeline"], refetchInterval: 15_000, queryFn: async () => (await api.get<{ lag_consume_segundos: number; mensajes_pendientes: number; ultimo_replay: string | null; colas?: { nombre: string; pendientes: number }[] }>(routes.reportes.pipelineEstado)).data });
  const replay = useMutation({
    mutationFn: async (body: Record<string, unknown>) => (await api.post<{ replay_id: string; estado: string; eventos_estimados: number }>(routes.reportes.pipelineReplay, { body })).data,
    onSuccess: (d) => useUiStore.getState().push({ tone: "success", message: t("started", { count: d.eventos_estimados }) }),
  });
  return (
    <div className="space-y-8">
      {q.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
      {q.isError && <ErrorNotice error={q.error} referenceLabel={tc("reference")} />}
      {q.data && (
        <>
          <MetricRibbon label={t("title")} items={[{ label: t("lag"), value: `${q.data.lag_consume_segundos} s` }, { label: t("pending"), value: formatNumber(q.data.mensajes_pendientes, locale) }, { label: t("lastReplay"), value: q.data.ultimo_replay ? formatDateTime(q.data.ultimo_replay, locale).split(",")[0] : "—" }]} />
          {q.data.colas && <EditorialTable caption={t("queues")} rows={q.data.colas} rowKey={(c) => c.nombre} columns={[{ key: "n", header: t("queue"), cell: (c) => <span className="font-mono">{c.nombre}</span> }, { key: "p", header: t("pending"), align: "right", cell: (c) => c.pendientes }]} />}
        </>
      )}
      <form className="card p-5 sm:p-6 flex max-w-3xl flex-wrap items-end gap-4" onSubmit={(e) => { e.preventDefault(); const f = new FormData(e.currentTarget); replay.mutate({ origen: f.get("origen"), desde: f.get("desde") || undefined, hasta: f.get("hasta") || undefined }); }}>
        <h3 className="w-full !text-xl">{t("replay")}</h3>
        <SelectField label={t("origin")} name="origen" defaultValue="TODOS">{["TODOS", "RESERVAS", "AMBIENTAL", "OFERTA", "CATALOGO"].map((o) => <option key={o} value={o}>{o}</option>)}</SelectField>
        <TextField label={t("from")} name="desde" type="date" /><TextField label={t("to")} name="hasta" type="date" />
        <Button type="submit" variant="danger" loading={replay.isPending}>{t("run")}</Button>
      </form>
    </div>
  );
}
