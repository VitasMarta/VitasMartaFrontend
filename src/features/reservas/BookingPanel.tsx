"use client";

import { useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/core/api/errorNormalizer";
import type { FichaCatalogo, Franja } from "@/core/api/types";
import { useSessionStore } from "@/core/auth/sessionStore";
import { amountOf, formatCOP, formatDate, localized } from "@/core/format";
import { useRouter, usePathname } from "@/core/i18n/navigation";
import { useFranjas } from "@/features/catalogo/api";
import { Button, ButtonLink } from "@/shared/ui/Button";
import { CheckboxField, ErrorSummary, TextField } from "@/shared/ui/forms";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { useCrearReserva } from "./api";

const MAX_CUPOS = 10;

/**
 * Lienzo derecho fijo de la ficha (guía §1.3-2): selector de franjas, cupos, aceptación de la
 * política de cancelación y botón para iniciar el soft lock de la reserva.
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
  const franjasQuery = useFranjas(atractivoId);
  const crear = useCrearReserva();

  const [franjaRef, setFranjaRef] = useState("");
  const [cupos, setCupos] = useState(1);
  const [acepta, setAcepta] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const byDate = useMemo(() => {
    const groups = new Map<string, Franja[]>();
    for (const f of franjasQuery.data?.franjas ?? []) groups.set(f.fecha, [...(groups.get(f.fecha) ?? []), f]);
    return [...groups.entries()];
  }, [franjasQuery.data]);

  const selected = franjasQuery.data?.franjas.find((f) => (f.franja_ref ?? `${f.fecha}T${f.hora_inicio}`) === franjaRef);
  const maxCupos = Math.max(1, Math.min(MAX_CUPOS, selected?.cupo ?? MAX_CUPOS));
  const price = amountOf(ficha.precio as number | { monto: number } | null | undefined);
  const politica = ficha.politica_cancelacion;

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!franjaRef) next.franja = t("errors.slot");
    if (!Number.isInteger(cupos) || cupos < 1 || cupos > maxCupos) next.cupos = t("errors.quantity", { max: maxCupos });
    if (!acepta) next.politica = t("errors.policy");
    if (!politica) next.politica = t("errors.noPolicy");
    setErrors(next);
    if (Object.keys(next).length > 0 || !politica) return;

    crear.mutate(
      {
        servicio_ref: atractivoId,
        franja_ref: franjaRef,
        cantidad_cupos: cupos,
        aceptacion_politica: { aceptada: true, politica_ref: politica.politica_ref, version: politica.version },
      },
      {
        onSuccess: (reserva) => router.push(`/mis-reservas/${reserva.reserva_ref}`),
        onError: (error) => {
          if (error instanceof ApiError) {
            if (error.codigo === "RESERVA_RESTRINGIDA") onRestricted();
            const fields = error.fieldErrors();
            if (Object.keys(fields).length > 0) setErrors(fields);
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

      {status !== "anonymous" && (status === "unknown" || rol === "TURISTA") && (
        <form onSubmit={onSubmit} noValidate className="mt-6 space-y-6">
          <ErrorSummary errors={errors} title={tc("errorSummary")} />

          {franjasQuery.isPending && <StatusBlock kind="loading" title={t("slotsLoading")} />}
          {franjasQuery.isError && <ErrorNotice error={franjasQuery.error} referenceLabel={tc("reference")} />}
          {franjasQuery.data && byDate.length === 0 && <StatusBlock kind="empty" title={t("noSlots")} />}

          {byDate.map(([fecha, franjas], index) => (
            <fieldset key={fecha} className="min-w-0">
              <legend className="meta mb-2 font-semibold uppercase tracking-wider">{formatDate(fecha, locale)}</legend>
              <div className="divide-y divide-ink/15 border-y border-ink/15">
                {franjas.map((f) => {
                  const ref = f.franja_ref ?? `${f.fecha}T${f.hora_inicio}`;
                  const soldOut = f.cupo <= 0 || f.estado === "AGOTADA";
                  const id = `franja-${ref}`;
                  return (
                    <div key={ref} className="flex items-center gap-3 py-3">
                      <input
                        id={id}
                        type="radio"
                        name="franja"
                        value={ref}
                        checked={franjaRef === ref}
                        disabled={soldOut}
                        required={index === 0}
                        onChange={() => {
                          setFranjaRef(ref);
                          setCupos((c) => Math.min(c, Math.max(1, Math.min(MAX_CUPOS, f.cupo))));
                        }}
                        className="size-5 accent-ink"
                        aria-describedby={`${id}-cupo`}
                      />
                      <label htmlFor={id} className={soldOut ? "flex-1 text-ink/70 line-through" : "flex-1 font-medium"}>
                        <span className="tabular">
                          {f.hora_inicio} – {f.hora_fin}
                        </span>
                      </label>
                      <span id={`${id}-cupo`} className={soldOut ? "meta font-semibold" : "meta"}>
                        {soldOut ? t("soldOut") : t("spotsLeft", { count: f.cupo })}
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

          {politica && (
            <div className="border-l-4 border-ink pl-3">
              <p className="font-semibold">{t("policy")}</p>
              <p className="mt-1 text-sm">{localized(politica.descripcion, locale)}</p>
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
