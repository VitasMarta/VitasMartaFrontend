"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/core/api/errorNormalizer";
import { localized } from "@/core/format";
import { Link } from "@/core/i18n/navigation";
import { BookingPanel } from "@/features/reservas/BookingPanel";
import { useDocumentTitle } from "@/shared/hooks";
import { Icon } from "@/shared/ui/Icon";
import { SplitLayout } from "@/shared/ui/layout";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { SustainabilityIndicator, levelFromOccupancy } from "@/shared/ui/indicators";
import { useAlternativas, useBuenasPracticas, useFicha, useMultimedia } from "./api";
import { AlternativesBand, BuenasPracticasBlock, DynamicAttributes, Gallery } from "./components";

/**
 * Ficha del atractivo — Vista Split-Screen (guía §1.3-2): lienzo izquierdo continuo (galería, descripción,
 * atributos JSONB, buenas prácticas M8, alternativas M6) + lienzo derecho fijo con la reserva (M3).
 */
export function FichaView({ id }: { id: string }) {
  const t = useTranslations("catalogo.ficha");
  const tc = useTranslations("common");
  const locale = useLocale();
  const ficha = useFicha(id);
  const media = useMultimedia(id);
  const buenasPracticas = useBuenasPracticas(id);
  const [restricted, setRestricted] = useState(false);

  const name = localized(ficha.data?.nombre, locale);
  useDocumentTitle(name || undefined);

  const occupancy = ficha.data?.sostenibilidad?.ocupacion_estimada;
  const level = ficha.data?.sostenibilidad?.nivel_saturacion ?? (occupancy != null ? levelFromOccupancy(occupancy) : undefined);
  // CU-13: se muestran alternativas cuando supera el 80 % o cuando M3 bloquea la reserva.
  const crowded = restricted || (occupancy != null && occupancy >= 80);
  const alternativas = useAlternativas(id, crowded);

  if (ficha.isPending) return <div className="mx-auto max-w-3xl px-4 py-10"><StatusBlock kind="loading" title={tc("loading")} /></div>;
  if (ficha.isError) {
    const notFound = ficha.error instanceof ApiError && ficha.error.status === 404;
    return (
      <div className="mx-auto max-w-3xl px-4 py-10">
        {notFound ? <StatusBlock kind="empty" title={t("notFound")} /> : <ErrorNotice error={ficha.error} referenceLabel={tc("reference")} />}
        <Link href="/buscar" className="text-link mt-4 inline-block font-semibold">{t("back")}</Link>
      </div>
    );
  }

  const data = ficha.data;
  return (
    <>
      <div className="border-b border-ink/15 bg-base">
        <div className="mx-auto max-w-7xl px-4 py-3 sm:px-6 lg:px-8">
          <Link href="/buscar" className="inline-flex min-h-11 items-center gap-1 font-semibold">
            <Icon name="arrow" className="rotate-180" />
            {t("back")}
          </Link>
        </div>
      </div>
      <SplitLayout
        rightLabel={t("bookingRegion")}
        left={
          <article>
            <Gallery media={media.data ?? []} name={name} />
            <header className="mt-8">
              {data.categorias && data.categorias.length > 0 && <p className="meta text-ink/80">{data.categorias.join(" · ")}</p>}
              <h1 className="mt-1">{name}</h1>
              {level && (
                <div className="mt-3">
                  <SustainabilityIndicator level={level} occupancy={occupancy} />
                </div>
              )}
            </header>
            {data.descripcion != null && <p className="mt-6 max-w-3xl text-lg">{localized(data.descripcion, locale)}</p>}

            {crowded && (
              <p role="status" className="mt-6 border-l-4 border-preventive pl-3 font-medium">
                {restricted ? t("restricted") : t("crowded", { value: Math.round(occupancy ?? 0) })}
              </p>
            )}

            <DynamicAttributes ficha={data} />
            <BuenasPracticasBlock data={buenasPracticas.data} />
            {crowded && <AlternativesBand data={alternativas.data} />}
          </article>
        }
        right={<BookingPanel atractivoId={id} ficha={data} onRestricted={() => setRestricted(true)} />}
      />
    </>
  );
}
