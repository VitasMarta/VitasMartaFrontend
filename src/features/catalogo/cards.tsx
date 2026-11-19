"use client";

import { useLocale, useTranslations } from "next-intl";
import type { ItemResultadoBusqueda } from "@/core/api/types";
import { amountOf, formatCOP, localized } from "@/core/format";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/shared/ui/cn";
import { Icon } from "@/shared/ui/Icon";
import { SustainabilityIndicator, levelFromOccupancy } from "@/shared/ui/indicators";

/** Precio de referencia de un destino: M2 real envía `precio_minimo`; se tolera `precio` (mocks). */
export function precioDe(item: ItemResultadoBusqueda): number | null {
  if (item.precio_minimo != null) return Number(item.precio_minimo);
  return amountOf(item.precio as number | { monto: number } | null | undefined);
}

export function ocupacionDe(item: ItemResultadoBusqueda) {
  const s = item.sostenibilidad;
  if (s == null) return null;
  const value = typeof s === "number" ? s : s.ocupacion_estimada;
  if (value == null) return null;
  return { value, level: typeof s === "object" && s.nivel_saturacion ? s.nivel_saturacion : levelFromOccupancy(value) };
}

/**
 * Imagen del destino o, si aún no tiene fotos, un fondo de marca con el ícono (decorativo).
 * Rellena por completo su contenedor (que debe ser `relative` con tamaño o proporción fija):
 * así una foto vertical u horizontal nunca cambia la altura de la tarjeta.
 */
export function DestinoImagen({ src, alt, className, prioridad }: { src?: string | null; alt: string; className?: string; prioridad?: boolean }) {
  const t = useTranslations("catalogo.card");
  if (src)
    // eslint-disable-next-line @next/next/no-img-element -- dominio del CDN (R2) aún sin definir en next.config
    return <img src={src} alt={alt} loading={prioridad ? "eager" : "lazy"} decoding="async" className={cn("absolute inset-0 h-full w-full object-cover", className)} />;
  return (
    <div className={cn("absolute inset-0 flex flex-col items-center justify-center gap-2 bg-gradient-to-br from-ink to-emerald-ink text-on-action", className)}>
      <Icon name="leaf" size={36} />
      <span className="text-sm font-semibold">{t("noPhoto")}</span>
    </div>
  );
}

function Precio({ item, align = "left" }: { item: ItemResultadoBusqueda; align?: "left" | "right" }) {
  const t = useTranslations("catalogo.card");
  const locale = useLocale();
  const precio = precioDe(item);
  if (precio == null) return <p className={cn("meta text-ink/80", align === "right" && "text-right")}>{t("noPrice")}</p>;
  return (
    <p className={cn(align === "right" && "text-right")}>
      <span className="meta block text-ink/80">{t("from")}</span>
      <span className="tabular text-xl font-bold">{formatCOP(precio, locale)}</span>
      <span className="meta block text-ink/80">{t("perPerson")}</span>
    </p>
  );
}

/** Tarjeta vertical de destino (portada, recomendaciones): imagen arriba y datos clave abajo. */
export function DestinoCard({ item, prioridad }: { item: ItemResultadoBusqueda; prioridad?: boolean }) {
  const t = useTranslations("catalogo.card");
  const locale = useLocale();
  const nombre = localized(item.nombre, locale);
  const occ = ocupacionDe(item);
  return (
    <li className="card card-hover relative flex flex-col overflow-hidden">
      <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
        <DestinoImagen src={item.imagen_url} alt={t("photoOf", { name: nombre })} prioridad={prioridad} />
      </div>
      <div className="flex flex-1 flex-col gap-2 p-4">
        {/* Título a 2 líneas con altura fija: categoría y precio quedan alineados entre tarjetas. */}
        <h3 className="line-clamp-2 min-h-[2.75em] !text-lg leading-snug" title={nombre}>
          {/* Enlace "estirado": toda la tarjeta es clicable sin anidar enlaces. */}
          <Link href={`/atractivo/${item.id}`} className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-action">
            {nombre}
          </Link>
        </h3>
        {item.categorias && item.categorias.length > 0 && <p className="meta truncate text-ink/80">{item.categorias.join(" · ")}</p>}
        {occ && <SustainabilityIndicator level={occ.level} occupancy={occ.value} />}
        <div className="mt-auto pt-2">
          <Precio item={item} />
        </div>
      </div>
    </li>
  );
}

/** Rejilla de tarjetas de destino. */
export function DestinoGrid({ items, label }: { items: ItemResultadoBusqueda[]; label: string }) {
  return (
    <ul role="list" aria-label={label} className="grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {items.map((item, i) => (
        <DestinoCard key={item.id} item={item} prioridad={i < 4} />
      ))}
    </ul>
  );
}

/** Tarjeta horizontal de resultado (búsqueda): imagen, datos, precio y llamada a la acción. */
export function ResultadoCard({ item }: { item: ItemResultadoBusqueda }) {
  const t = useTranslations("catalogo");
  const locale = useLocale();
  const nombre = localized(item.nombre, locale);
  const occ = ocupacionDe(item);
  const resumen = localized(item.descripcion_corta, locale);
  return (
    <li className="card card-hover relative grid gap-4 overflow-hidden p-4 sm:h-64 sm:grid-cols-[220px_1fr] md:grid-cols-[240px_1fr_auto]">
      <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md sm:aspect-auto sm:h-full">
        <DestinoImagen src={item.imagen_url} alt={t("card.photoOf", { name: nombre })} />
      </div>
      <div className="flex min-h-0 min-w-0 flex-col gap-2 overflow-hidden">
        <h3 className="line-clamp-2 !text-xl leading-snug" title={nombre}>
          <Link href={`/atractivo/${item.id}`} className="text-action after:absolute after:inset-0 after:content-[''] hover:underline">
            {nombre}
          </Link>
        </h3>
        {(item.tipo || item.distancia_km != null) && (
          <p className="meta flex flex-wrap items-center gap-x-3 text-ink/80">
            {item.tipo && <span>{t(`types.${item.tipo}`)}</span>}
            {item.distancia_km != null && (
              <span className="inline-flex items-center gap-1">
                <Icon name="pin" size={14} />
                {t("row.distance", { km: item.distancia_km })}
              </span>
            )}
          </p>
        )}
        {item.categorias && item.categorias.length > 0 && (
          <ul role="list" className="flex flex-wrap gap-2 overflow-hidden sm:max-h-[1.9rem]">
            {item.categorias.map((c) => (
              <li key={c} className="meta rounded border border-ink/60 px-2 py-0.5">{c}</li>
            ))}
          </ul>
        )}
        {resumen && <p className="line-clamp-2 text-ink/90">{resumen}</p>}
        {occ && <div className="mt-1"><SustainabilityIndicator level={occ.level} occupancy={occ.value} /></div>}
      </div>
      <div className="flex flex-row items-end justify-between gap-4 md:flex-col md:items-end md:justify-between">
        <Precio item={item} align="right" />
        {/* Indicación visual; el enlace real es el título estirado (evita enlaces anidados). */}
        <span aria-hidden="true" className="inline-flex min-h-11 items-center gap-1 rounded-md bg-action px-4 font-semibold text-on-action">
          {t("card.viewAvailability")}
          <Icon name="arrow" />
        </span>
      </div>
    </li>
  );
}
