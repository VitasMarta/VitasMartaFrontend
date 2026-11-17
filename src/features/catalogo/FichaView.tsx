"use client";

import { useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import { ApiError } from "@/core/api/errorNormalizer";
import { localized } from "@/core/format";
import { Link } from "@/core/i18n/navigation";
import { BookingPanel } from "@/features/reservas/BookingPanel";
import { useDocumentTitle } from "@/shared/hooks";
import { Icon } from "@/shared/ui/Icon";
import { Container } from "@/shared/ui/layout";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { SustainabilityIndicator, levelFromOccupancy } from "@/shared/ui/indicators";
import { useAlternativas, useBuenasPracticas, useFicha, useMultimedia } from "./api";
import { AlternativesBand, BuenasPracticasBlock, DynamicAttributes, Gallery } from "./components";

/**
 * Ficha del destino: encabezado con ubicación y "Reserva ahora", galería en rejilla con el panel de
 * sostenibilidad (M8) al lado, y abajo la descripción, los puntos fuertes (atributos M2) y la reserva (M3).
 */
export function FichaView({ id }: { id: string }) {
  const t = useTranslations("catalogo.ficha");
  const tl = useTranslations("catalogo.layout");
  const ts = useTranslations("common.saturation");
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

  if (ficha.isPending) return <Container className="py-10"><StatusBlock kind="loading" title={tc("loading")} /></Container>;
  if (ficha.isError) {
    const notFound = ficha.error instanceof ApiError && ficha.error.status === 404;
    return (
      <Container className="py-10">
        {notFound ? <StatusBlock kind="empty" title={t("notFound")} /> : <ErrorNotice error={ficha.error} referenceLabel={tc("reference")} />}
        <Link href="/buscar" className="text-link mt-4 inline-block font-semibold">{t("back")}</Link>
      </Container>
    );
  }

  const data = ficha.data;
  const ubicacion = data.ubicacion as { lat?: number; lng?: number } | undefined;
  const mapa = ubicacion?.lat != null && ubicacion?.lng != null ? `https://www.openstreetmap.org/?mlat=${ubicacion.lat}&mlon=${ubicacion.lng}#map=15/${ubicacion.lat}/${ubicacion.lng}` : null;
  const categorias = (data.categorias ?? []).map((c) => (typeof c === "string" ? c : c.nombre ?? c.slug));

  return (
    <Container className="py-6">
      <nav aria-label="breadcrumb" className="meta">
        <ol className="flex flex-wrap items-center gap-2 text-ink/80">
          <li><Link href="/" className="text-link">{tl("breadcrumbHome")}</Link></li>
          <li aria-hidden="true">›</li>
          <li><Link href="/buscar" className="text-link">{t("back")}</Link></li>
          <li aria-hidden="true">›</li>
          <li aria-current="page">{name}</li>
        </ol>
      </nav>

      <header className="mt-4 flex flex-wrap items-start justify-between gap-4">
        <div className="min-w-0">
          {categorias.length > 0 && <p className="meta text-ink/80">{categorias.join(" · ")}</p>}
          <h1 className="mt-1 !text-4xl">{name}</h1>
          {ubicacion?.lat != null && (
            <p className="mt-2 flex flex-wrap items-center gap-x-2 text-ink/90">
              <Icon name="pin" className="text-action" />
              <span>{tl("location")}: Santa Marta</span>
              {mapa && (
                <a href={mapa} target="_blank" rel="noreferrer" className="text-link font-semibold">
                  {tl("viewMap")}
                </a>
              )}
            </p>
          )}
        </div>
        <a href="#reservar" className="inline-flex min-h-11 items-center rounded-md bg-action px-6 font-semibold text-on-action hover:bg-action-strong">
          {tl("bookNow")}
        </a>
      </header>

      {/* Dos columnas alineadas de arriba abajo: galería y contenido a la izquierda; reserva y
          contexto (sostenibilidad, aforo, mapa) a la derecha, con el mismo ancho en toda la ficha. */}
      <div className="mt-5 grid gap-6 lg:grid-cols-[minmax(0,1fr)_380px]">
        <div className="min-w-0">
          <Gallery media={media.data ?? []} name={name} />
        </div>
        {/* Misma altura que la galería: el mapa ocupa el espacio que deja la reserva. */}
        <div className="flex flex-col gap-4">
          <aside id="reservar" aria-label={t("bookingRegion")} className="card scroll-mt-24 p-5">
            <BookingPanel atractivoId={id} ficha={data} onRestricted={() => setRestricted(true)} />
          </aside>
          {mapa && (
            <a href={mapa} target="_blank" rel="noreferrer" className="card card-hover flex min-h-28 flex-1 flex-col items-center justify-center gap-2 bg-gradient-to-br from-page to-mist p-4 font-semibold text-action">
              <Icon name="pin" size={28} />
              {tl("viewMap")}
            </a>
          )}
        </div>

        <article className="min-w-0 space-y-6">
          {data.descripcion != null && (
            <section aria-labelledby="about-title" className="card p-5">
              <h2 id="about-title" className="!text-2xl">{tl("about")}</h2>
              <p className="mt-3 max-w-3xl text-lg">{localized(data.descripcion, locale)}</p>
            </section>
          )}
          <DynamicAttributes ficha={data} />
          <BuenasPracticasBlock data={buenasPracticas.data} />
          {crowded && <AlternativesBand data={alternativas.data} />}
        </article>

        <div className="space-y-4">
          {level && (
            <section aria-label={ts(level)} className="card p-4">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="font-semibold">{ts(level)}</p>
                  <p className="meta text-ink/80">{t("goodPractices")}</p>
                </div>
                {occupancy != null && (
                  <span className="tabular rounded-md bg-ink px-2.5 py-1.5 text-lg font-bold text-on-action">{Math.round(occupancy)} %</span>
                )}
              </div>
              <div className="mt-3"><SustainabilityIndicator level={level} occupancy={occupancy} /></div>
            </section>
          )}
          {crowded && (
            <p role="status" className="card border-l-4 !border-l-preventive p-4 font-medium">
              {restricted ? t("restricted") : t("crowded", { value: Math.round(occupancy ?? 0) })}
            </p>
          )}
        </div>
      </div>
    </Container>
  );
}
