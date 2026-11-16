"use client";

import { useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { ApiError } from "@/core/api/errorNormalizer";
import type { ReservaRespuesta } from "@/core/api/types";
import { RequireRole } from "@/core/auth/RequireRole";
import { amountOf, formatCOP, formatDate, formatDateTime, formatTime, localDayOf, localized } from "@/core/format";
import { Link } from "@/core/i18n/navigation";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { EditorialTable } from "@/shared/ui/EditorialTable";
import { CheckboxField, ErrorSummary, SelectField, TextAreaField, TextField } from "@/shared/ui/forms";
import { CountdownBar } from "@/shared/ui/indicators";
import { Container, DefinitionRows, PageHeader } from "@/shared/ui/layout";
import { Pagination } from "@/shared/ui/Pagination";
import { SlideOver } from "@/shared/ui/SlideOver";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { Tabs } from "@/shared/ui/Tabs";
import { useUiStore } from "@/core/store/uiStore";
import { descargarComprobante, useAccionReserva, useOfertasReserva, useReserva, useReservas, type ClasificacionReserva } from "./api";
import { cuposDe, ofertaAgotada } from "./BookingPanel";
import { PoliticaOfertaTexto, ReservaStatus, isFinal, isPending } from "./util";

const SIZE = 10;
const CLASES: ClasificacionReserva[] = ["ACTIVAS", "PASADAS", "CANCELADAS"];

const totalOf = (r: ReservaRespuesta, locale: string) => {
  const a = amountOf(r.tarifa as number | { monto: number } | null | undefined);
  return a == null ? "—" : formatCOP(a, locale);
};

function ReservasTable({ clasificacion }: { clasificacion: ClasificacionReserva }) {
  const t = useTranslations("reservas.list");
  const tc = useTranslations("common");
  const locale = useLocale();
  const [page, setPage] = useState(0);
  const query = useReservas(clasificacion, page, SIZE);
  if (query.isPending) return <StatusBlock kind="loading" title={tc("loading")} />;
  if (query.isError) return <ErrorNotice error={query.error} referenceLabel={tc("reference")} />;
  const total = query.data.totalElements ?? query.data.total_elements ?? query.data.content.length;

  return (
    <>
      <EditorialTable
        caption={t(`tabs.${clasificacion}`)}
        rows={query.data.content}
        rowKey={(r) => r.reserva_ref}
        empty={t(`empty.${clasificacion}`)}
        columns={[
          { key: "codigo", header: t("code"), cell: (r) => <span className="font-mono text-sm">{r.codigo_confirmacion ?? r.reserva_ref}</span> },
          { key: "servicio", header: t("service"), cell: (r) => <span className="font-semibold">{localized(r.servicio_nombre, locale) || r.servicio_ref}</span> },
          { key: "fecha", header: t("date"), cell: (r) => formatDateTime(r.fecha_inicio, locale) },
          { key: "cupos", header: t("spots"), align: "right", cell: (r) => r.cantidad_cupos ?? "—" },
          { key: "total", header: t("total"), align: "right", cell: (r) => totalOf(r, locale) },
          { key: "estado", header: tc("status"), cell: (r) => <ReservaStatus estado={r.estado} /> },
          {
            key: "ver",
            header: <span className="sr-only">{tc("actions")}</span>,
            cell: (r) => (
              <Link href={`/mis-reservas/${r.reserva_ref}`} className="text-link font-semibold">
                {tc("details")}
                <span className="sr-only"> {r.codigo_confirmacion ?? r.reserva_ref}</span>
              </Link>
            ),
          },
        ]}
      />
      <Pagination page={page} pageSize={SIZE} total={total} onChange={setPage} />
    </>
  );
}

export function MyReservationsView() {
  const t = useTranslations("reservas.list");
  useDocumentTitle(t("title"));
  return (
    <RequireRole area="turista">
      <PageHeader title={t("title")} description={t("description")} />
      <Container className="py-8">
        <Tabs label={t("title")} tabs={CLASES.map((c) => ({ id: c, label: t(`tabs.${c}`), content: <ReservasTable clasificacion={c} /> }))} />
      </Container>
    </RequireRole>
  );
}

// ── Detalle: cuenta regresiva del soft lock, cancelar, modificar, comprobante ───────────────────
function CancelPanel({ reserva, open, onClose }: { reserva: ReservaRespuesta; open: boolean; onClose: () => void }) {
  const t = useTranslations("reservas.cancel");
  const tc = useTranslations("common");
  const accion = useAccionReserva("cancelar");
  const [error, setError] = useState<string>();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const motivo = String(new FormData(e.currentTarget).get("motivo") ?? "").trim();
    if (motivo.length < 3) return setError(t("reasonRequired"));
    setError(undefined);
    accion.mutate(
      { reservaRef: reserva.reserva_ref, body: { motivo } },
      {
        onSuccess: (r) => {
          const pct = r.penalidad_aplicada_porcentaje ?? 0;
          useUiStore.getState().push({ tone: pct > 0 ? "warn" : "success", message: pct > 0 ? t("donePenalty", { pct }) : t("done") });
          onClose();
        },
      },
    );
  };

  return (
    <SlideOver open={open} onClose={onClose} title={t("title")}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <p>{reserva.politica?.descripcion ?? t("generic")}</p>
        <TextAreaField label={t("reason")} name="motivo" required error={error} />
        <div className="flex gap-3">
          <Button type="submit" variant="danger" loading={accion.isPending}>{t("confirm")}</Button>
          <Button variant="secondary" onClick={onClose}>{tc("back")}</Button>
        </div>
      </form>
    </SlideOver>
  );
}

function ModifyPanel({ reserva, open, onClose }: { reserva: ReservaRespuesta; open: boolean; onClose: () => void }) {
  const t = useTranslations("reservas.modify");
  const tc = useTranslations("common");
  const locale = useLocale();
  const servicio = reserva.servicio_ref ?? "";
  // Franjas y política vigentes desde M3 (las mismas que valida al modificar).
  const ofertas = useOfertasReserva(open ? servicio : "");
  const accion = useAccionReserva("modificar");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [franjaRef, setFranjaRef] = useState("");
  const disponibles = (ofertas.data?.ofertas ?? []).filter((o) => !ofertaAgotada(o));
  const elegida = disponibles.find((o) => o.franja_ref === franjaRef);
  const politica = (elegida ?? disponibles[0])?.politica;

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const cupos = Number(f.get("cupos"));
    const next: Record<string, string> = {};
    if (!elegida) next.franja = t("errors.slot");
    if (!Number.isInteger(cupos) || cupos < 1 || (elegida && cupos > cuposDe(elegida))) next.cupos = t("errors.quantity");
    if (!f.get("politica")) next.politica = t("errors.policy");
    setErrors(next);
    if (Object.keys(next).length || !elegida) return;
    accion.mutate(
      { reservaRef: reserva.reserva_ref, body: { servicio_ref: elegida.servicio_ref, franja_ref: elegida.franja_ref, cantidad_cupos: cupos, aceptacion_politica: { aceptada: true, politica_ref: elegida.politica.politica_ref, version: elegida.politica.version } } },
      {
        onSuccess: (nueva) => {
          useUiStore.getState().push({ tone: "success", message: t("done", { code: nueva.codigo_confirmacion ?? nueva.reserva_ref }) });
          onClose();
        },
      },
    );
  };

  return (
    <SlideOver open={open} onClose={onClose} title={t("title")}>
      <form onSubmit={onSubmit} noValidate className="space-y-5">
        <ErrorSummary errors={errors} title={tc("errorSummary")} />
        {ofertas.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {ofertas.isError && <ErrorNotice error={ofertas.error} referenceLabel={tc("reference")} />}
        <SelectField label={t("slot")} name="franja" value={franjaRef} onChange={(e) => setFranjaRef(e.target.value)} required error={errors.franja}>
          <option value="" disabled>{t("choose")}</option>
          {disponibles.map((o) => (
            <option key={o.franja_ref} value={o.franja_ref}>
              {formatDate(localDayOf(o.inicio), locale)} · {formatTime(o.inicio, locale)}–{formatTime(o.fin, locale)}
              {o.disponibles != null ? ` (${o.disponibles})` : ""}
            </option>
          ))}
        </SelectField>
        <TextField label={t("quantity")} name="cupos" type="number" min={1} max={cuposDe(elegida)} defaultValue={reserva.cantidad_cupos ?? 1} required error={errors.cupos} className="max-w-40" />
        {politica && <PoliticaOfertaTexto politica={politica} className="border-l-4 border-ink pl-3 text-sm" />}
        <CheckboxField label={t("accept")} name="politica" required error={errors.politica} />
        <div className="flex gap-3">
          <Button type="submit" loading={accion.isPending}>{t("confirm")}</Button>
          <Button variant="secondary" onClick={onClose}>{tc("back")}</Button>
        </div>
      </form>
    </SlideOver>
  );
}

export function ReservationDetailView({ reservaRef }: { reservaRef: string }) {
  const t = useTranslations("reservas.detail");
  const tc = useTranslations("common");
  const locale = useLocale();
  const queryClient = useQueryClient();
  const query = useReserva(reservaRef);
  const [panel, setPanel] = useState<"cancel" | "modify" | null>(null);
  const [downloading, setDownloading] = useState(false);
  useDocumentTitle(t("title"));

  const r = query.data;
  const onDownload = async () => {
    setDownloading(true);
    try {
      await descargarComprobante(reservaRef);
    } catch (error) {
      useUiStore.getState().push({ tone: "error", message: error instanceof Error ? error.message : tc("error.title"), reference: error instanceof ApiError ? error.correlationId : undefined });
    } finally {
      setDownloading(false);
    }
  };

  return (
    <RequireRole area="turista">
      {r?.vence_en && isPending(r.estado) && (
        <CountdownBar deadline={r.vence_en} instruction={r.siguiente_accion} onExpire={() => queryClient.invalidateQueries({ queryKey: ["reservas"] })} />
      )}
      <PageHeader
        title={r ? localized(r.servicio_nombre, locale) || t("title") : t("title")}
        eyebrow={<Link href="/mis-reservas" className="text-link">{t("back")}</Link>}
        actions={
          r && (
            <>
              <Button variant="secondary" onClick={onDownload} loading={downloading}>{t("voucher")}</Button>
              {!isFinal(r.estado) && <Button variant="secondary" onClick={() => setPanel("modify")}>{t("modify")}</Button>}
              {!isFinal(r.estado) && <Button variant="danger" onClick={() => setPanel("cancel")}>{t("cancel")}</Button>}
            </>
          )
        }
      />
      <Container className="py-8">
        {query.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {query.isError && <ErrorNotice error={query.error} referenceLabel={tc("reference")} />}
        {r && (
          <div className="max-w-3xl space-y-6">
            <p className="flex items-center gap-4">
              <ReservaStatus estado={r.estado} />
              {r.codigo_confirmacion && <span className="meta">{t("code")}: <strong className="font-mono">{r.codigo_confirmacion}</strong></span>}
            </p>
            {r.siguiente_accion && isPending(r.estado) && <p role="status" className="border-l-4 border-emerald pl-3 font-medium">{r.siguiente_accion}</p>}
            {r.instrucciones_pago_externo && <p className="border-l-4 border-ink pl-3">{r.instrucciones_pago_externo}</p>}
            {r.estado === "CANCELADA" && (
              <p role="status" className="border-l-4 border-preventive pl-3 font-medium">
                {r.penalidad_aplicada_porcentaje ? t("penalty", { pct: r.penalidad_aplicada_porcentaje }) : t("noPenalty")}
              </p>
            )}
            <DefinitionRows
              rows={([
                { term: t("start"), value: formatDateTime(r.fecha_inicio, locale) },
                r.fecha_fin && r.fecha_fin !== r.fecha_inicio ? { term: t("end"), value: formatDateTime(r.fecha_fin, locale) } : null,
                r.cantidad_cupos ? { term: t("spots"), value: r.cantidad_cupos } : null,
                { term: t("total"), value: <strong className="tabular">{totalOf(r, locale)}</strong> },
                r.politica?.descripcion ? { term: t("policy"), value: r.politica.descripcion } : null,
                r.original_ref ? { term: t("original"), value: <Link href={`/mis-reservas/${r.original_ref}`} className="text-link">{r.original_ref}</Link> } : null,
                r.reemplazo_ref ? { term: t("replacement"), value: <Link href={`/mis-reservas/${r.reemplazo_ref}`} className="text-link">{r.reemplazo_ref}</Link> } : null,
              ] as ({ term: React.ReactNode; value: React.ReactNode } | null)[]).filter((x): x is { term: React.ReactNode; value: React.ReactNode } => x !== null)}
            />
          </div>
        )}
      </Container>
      {r && <CancelPanel reserva={r} open={panel === "cancel"} onClose={() => setPanel(null)} />}
      {r && <ModifyPanel reserva={r} open={panel === "modify"} onClose={() => setPanel(null)} />}
    </RequireRole>
  );
}
