"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/core/api/errorNormalizer";
import type { FichaCatalogo, OfertaReservable } from "@/core/api/types";
import { useSessionStore } from "@/core/auth/sessionStore";
import { amountOf, formatCOP, formatDate, formatTime, localDayOf } from "@/core/format";
import { useRouter, usePathname } from "@/core/i18n/navigation";
import { Button, ButtonLink } from "@/shared/ui/Button";
import { CheckboxField, ErrorSummary, TextField } from "@/shared/ui/forms";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { useCrearReserva, useOfertasReserva } from "./api";
import { PoliticaOfertaTexto } from "./util";

const MAX_CUPOS = 10;

/** Cupos que se pueden pedir en una oferta (`disponibles` null = desconocido → tope general). */
export const cuposDe = (o: OfertaReservable | undefined): number =>
  o?.disponibles == null ? MAX_CUPOS : Math.max(0, Math.min(MAX_CUPOS, o.disponibles));

export const ofertaAgotada = (o: OfertaReservable): boolean => !o.reservable || o.disponibles === 0;

/**
 * Lienzo derecho fijo de la ficha (guía §1.3-2): selector de franjas, cupos, aceptación de la
 * política de cancelación y botón para iniciar el soft lock de la reserva.
 *
 * Franjas, cupos vivos, tarifa y política salen de M3 (`/reservas/ofertas/{servicio_ref}`): son
 * exactamente los que M3 valida al crear la reserva. La ficha de M2 solo aporta el precio de
 * referencia mientras no hay sesión.
 */
export function BookingPanel({
  atractivoId,
  ficha,
  onRestricted,
}: {
  atractivoId: string;
  ficha: FichaCatalogo;
  /** M3 bloqueó por umbral crítico (409 RESERVA_RESTRINGIDA) → la ficha muestra alternativas. */
  onRestricted: () => void;
}) {
  const t = useTranslations("reservas.booking");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const status = useSessionStore((s) => s.status);
  const rol = useSessionStore((s) => s.user?.rol);
  const ofertasQuery = useOfertasReserva(rol === "TURISTA" ? atractivoId : "");
  const crear = useCrearReserva();

  const [franjaRef, setFranjaRef] = useState("");
  const [cupos, setCupos] = useState(1);
  const [acepta, setAcepta] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const ofertas = useMemo(() => ofertasQuery.data?.ofertas ?? [], [ofertasQuery.data]);
  const byDate = useMemo(() => {
    const groups = new Map<string, OfertaReservable[]>();
    for (const o of ofertas) {
      const day = localDayOf(o.inicio);
      groups.set(day, [...(groups.get(day) ?? []), o]);
    }
    return [...groups.entries()];
  }, [ofertas]);

  const selected = ofertas.find((o) => o.franja_ref === franjaRef);
  const maxCupos = Math.max(1, cuposDe(selected));
  // La política a aceptar es la de la franja elegida (antes de elegir se muestra la de la primera).
  const politica = (selected ?? ofertas.find((o) => o.reservable) ?? ofertas[0])?.politica;
  const importes = ofertas.map((o) => Number(o.importe)).filter((n) => Number.isFinite(n));
  const price = importes.length
    ? Math.min(...importes)
    : (ficha.rango_precio?.minimo ?? amountOf(ficha.precio as number | { monto: number } | null | undefined));

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!selected) next.franja = t("errors.slot");
    if (!Number.isInteger(cupos) || cupos < 1 || cupos > maxCupos) next.cupos = t("errors.quantity", { max: maxCupos });
    if (!acepta) next.politica = t("errors.policy");
    if (selected && !selected.politica) next.politica = t("errors.noPolicy");
    setErrors(next);
    if (Object.keys(next).length > 0 || !selected) return;

    crear.mutate(
      {
        servicio_ref: selected.servicio_ref,
        franja_ref: selected.franja_ref,
        cantidad_cupos: cupos,
        aceptacion_politica: { aceptada: true, politica_ref: selected.politica.politica_ref, version: selected.politica.version },
      },
      {
        onSuccess: (reserva) => router.push(`/mis-reservas/${reserva.reserva_ref}`),
        onError: (error) => {
          if (error instanceof ApiError) {
            if (error.codigo === "RESERVA_RESTRINGIDA") onRestricted();
            const fields = error.fieldErrors();
            if (Object.keys(fields).length > 0) setErrors(fields);
            void ofertasQuery.refetch(); // cupos o restricción cambiaron: refresca la lista
          }
        },
      },
    );
  };

  return (
    <div>
      <h2 className="!text-2xl">{t("title")}</h2>
      {price != null && (
        <p className="mt-1 text-lg">
          {t("from")} <strong className="tabular">{formatCOP(price, locale)}</strong> {t("perPerson")}
        </p>
      )}

      {status === "anonymous" && (
        <div className="mt-6">
          <p>{t("loginRequired")}</p>
          <ButtonLink href={`/login?volver=${encodeURIComponent(pathname)}`} className="mt-3">
            {t("loginToBook")}
          </ButtonLink>
        </div>
      )}
      {status === "authenticated" && rol !== "TURISTA" && <p className="mt-6 border-l-4 border-ink pl-3">{t("onlyTourists")}</p>}
      {status === "unknown" && <StatusBlock kind="loading" title={t("slotsLoading")} />}

      {status === "authenticated" && rol === "TURISTA" && ofertasQuery.isPending && (
        <StatusBlock kind="loading" title={t("slotsLoading")} className="mt-6" />
      )}
      {status === "authenticated" && rol === "TURISTA" && ofertasQuery.isError && (
        <ErrorNotice error={ofertasQuery.error} referenceLabel={tc("reference")} />
      )}
      {/* Sin franjas no hay nada que reservar: solo el aviso, sin cupos, política ni botón. */}
      {status === "authenticated" && rol === "TURISTA" && ofertasQuery.data && byDate.length === 0 && (
        <StatusBlock kind="empty" title={t("noSlots")} className="mt-6" />
      )}

      {status === "authenticated" && rol === "TURISTA" && byDate.length > 0 && (
        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
          <ErrorSummary errors={errors} title={tc("errorSummary")} />

          {byDate.map(([fecha, franjas], index) => (
            <fieldset key={fecha} className="min-w-0">
              <legend className="meta mb-2 font-semibold uppercase tracking-wider">{formatDate(fecha, locale)}</legend>
              <div className="divide-y divide-ink/15 border-y border-ink/15">
                {franjas.map((o) => {
                  const ref = o.franja_ref;
                  const agotada = ofertaAgotada(o);
                  const id = `franja-${ref}`;
                  const estado = !o.reservable
                    ? o.motivo_no_reservable || t("notBookable")
                    : o.disponibles === 0
                      ? t("soldOut")
                      : o.disponibles == null
                        ? t("spotsUnknown")
                        : t("spotsLeft", { count: o.disponibles });
                  return (
                    <div key={ref} className="flex items-center gap-3 py-3">
                      <input
                        id={id}
                        type="radio"
                        name="franja"
                        value={ref}
                        checked={franjaRef === ref}
                        disabled={agotada}
                        required={index === 0}
                        onChange={() => {
                          setFranjaRef(ref);
                          setAcepta(false); // la política puede cambiar entre franjas: se vuelve a aceptar
                          setCupos((c) => Math.min(c, Math.max(1, cuposDe(o))));
                        }}
                        className="size-5 accent-ink"
                        aria-describedby={`${id}-cupo`}
                      />
                      <label htmlFor={id} className={agotada ? "flex-1 text-ink/70 line-through" : "flex-1 font-medium"}>
                        <span className="tabular">
                          {formatTime(o.inicio, locale)} – {formatTime(o.fin, locale)}
                        </span>
                      </label>
                      <span id={`${id}-cupo`} className={agotada ? "meta font-semibold" : "meta"}>
                        {estado}
                      </span>
                    </div>
                  );
                })}
              </div>
            </fieldset>
          ))}
          {errors.franja && !franjaRef && (
            <p role="alert" className="text-sm font-medium text-critical">
              {errors.franja}
            </p>
          )}

          <TextField
            label={t("quantity")}
            name="cupos"
            type="number"
            inputMode="numeric"
            min={1}
            max={maxCupos}
            value={cupos}
            onChange={(e) => setCupos(Number(e.target.value))}
            error={errors.cupos ?? errors.cantidad_cupos}
            required
            className="max-w-40"
          />

          {selected?.requiere_aprobacion && <p className="meta">{t("needsApproval")}</p>}

          {politica && (
            <div className="border-l-4 border-ink pl-3">
              <p className="font-semibold">{t("policy")}</p>
              <PoliticaOfertaTexto politica={politica} className="mt-1 text-sm" />
            </div>
          )}
          <CheckboxField
            label={t("accept")}
            name="politica"
            checked={acepta}
            onChange={(e) => setAcepta(e.target.checked)}
            error={errors.politica ?? errors.aceptacion_politica}
            required
          />

          {crear.isError && !(crear.error instanceof ApiError && crear.error.fieldErrors().cantidad_cupos) && (
            <div>
              <ErrorNotice error={crear.error} referenceLabel={tc("reference")} />
              {crear.error instanceof ApiError && crear.error.status === 0 && <p className="meta mt-1">{t("retryHint")}</p>}
            </div>
          )}

          <Button type="submit" loading={crear.isPending} className="w-full">
            {crear.isPending ? t("submitting") : t("submit")}
          </Button>
        </form>
      )}
    </div>
  );
}
