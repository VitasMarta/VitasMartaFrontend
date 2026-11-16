"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/core/i18n/navigation";
import type {
  AlternativasRespuesta,
  BuenasPracticas,
  FichaCatalogo,
  ItemResultadoBusqueda,
  MultimediaDTO,
} from "@/core/api/types";
import { amountOf, formatCOP, formatDate, localized } from "@/core/format";
import { EditorialList, EditorialRow } from "@/shared/ui/EditorialRow";
import { Icon } from "@/shared/ui/Icon";
import { DefinitionRows } from "@/shared/ui/layout";
import { SustainabilityIndicator, levelFromOccupancy } from "@/shared/ui/indicators";
import { useRecomendaciones } from "./api";
import { useSessionStore } from "@/core/auth/sessionStore";

// ── Filas del catálogo (M2) ─────────────────────────────────────────────────────────────────────
function occupancyOf(item: ItemResultadoBusqueda): { value: number; level: ReturnType<typeof levelFromOccupancy> } | null {
  const s = item.sostenibilidad;
  if (s == null) return null;
  const value = typeof s === "number" ? s : s.ocupacion_estimada;
  if (value == null) return null;
  return { value, level: typeof s === "object" && s.nivel_saturacion ? s.nivel_saturacion : levelFromOccupancy(value) };
}

export function CatalogRows({ items, label, startAt = 1 }: { items: ItemResultadoBusqueda[]; label: string; startAt?: number }) {
  const t = useTranslations("catalogo");
  const locale = useLocale();
  return (
    <EditorialList label={label}>
      {items.map((item, i) => {
        const occ = occupancyOf(item);
        const price = amountOf(item.precio as number | { monto: number } | null | undefined);
        return (
          <EditorialRow
            key={item.id}
            index={startAt + i}
            title={localized(item.nombre, locale)}
            href={`/atractivo/${item.id}`}
            categories={item.categorias}
            summary={localized(item.descripcion_corta, locale)}
            meta={[item.tipo && t(`types.${item.tipo}`), item.distancia_km != null && t("row.distance", { km: item.distancia_km })].filter(Boolean).join(" · ") || undefined}
            price={price == null ? t("row.consult") : formatCOP(price, locale)}
            indicator={occ && <SustainabilityIndicator level={occ.level} occupancy={occ.value} />}
            actionLabel={t("row.explore")}
            imageUrl={item.imagen_url}
          />
        );
      })}
    </EditorialList>
  );
}

// ── Banda de recomendaciones IA (M6) ────────────────────────────────────────────────────────────
export function RecommendationsBand() {
  const t = useTranslations("catalogo.ai");
  const rol = useSessionStore((s) => s.user?.rol);
  const { data } = useRecomendaciones(5);
  if (rol !== "TURISTA" || !data || data.items.length === 0) return null; // M6 caído o sin datos: se oculta

  const personalized = data.estado_respuesta === "PERSONALIZADA";
  return (
    <section aria-labelledby="ia-title" className="border-y-2 border-ink bg-mist">
      <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 lg:px-8">
        <p className="inline-flex items-center gap-2 border-l-4 border-emerald pl-3 font-semibold text-emerald-ink">
          <Icon name="spark" />
          {personalized ? t("seal") : t("sealGeneral")}
        </p>
        <div className="mt-3 flex flex-wrap items-end justify-between gap-3">
          <h2 id="ia-title">{t("title")}</h2>
          <Link href="/mi-perfil?seccion=consentimientos" className="text-link font-semibold">
            {t("configure")}
          </Link>
        </div>
        <p className="mt-2 max-w-3xl text-ink/90">{data.aviso_transparencia_ia}</p>
        {data.degradada && (
          <p className="meta mt-1 inline-block text-ink/80">
            <span className="font-semibold">{t("fallbackTag")}</span>
          </p>
        )}
      </div>
      <div className="mt-4">
        <EditorialList label={t("title")}>
          {data.items.map((item, i) => (
            <EditorialRow
              key={item.atractivo_ref}
              index={i + 1}
              title={item.nombre}
              href={`/atractivo/${item.atractivo_ref}`}
              categories={item.categorias}
              explanation={item.explicacion}
              badge={
                item.sostenibilidad.es_alternativa_sostenible && (
                  <p className="meta inline-flex items-center gap-1.5 font-semibold text-emerald-ink">
                    <Icon name="leaf" size={16} />
                    {t("sustainable")}
                  </p>
                )
              }
              indicator={<SustainabilityIndicator level={item.sostenibilidad.nivel_saturacion} occupancy={item.sostenibilidad.ocupacion_estimada} />}
              actionLabel={t("explore")}
            />
          ))}
        </EditorialList>
      </div>
    </section>
  );
}

// ── Galería (Cloudflare R2): continua, sin bordes redondeados; la 1.ª imagen es la del LCP ──────────
export function Gallery({ media, name }: { media: MultimediaDTO[]; name: string }) {
  const t = useTranslations("catalogo.ficha");
  if (media.length === 0) return null;
  const [hero, ...rest] = media;
  return (
    <section aria-label={t("gallery")} className="-mx-4 sm:-mx-8">
      {hero.tipo === "foto" ? (
        // eslint-disable-next-line @next/next/no-img-element -- dominio del CDN (R2) aún sin definir en next.config
        <img src={hero.url_cdn} alt={t("galleryAlt", { name, n: 1 })} fetchPriority="high" decoding="async" className="aspect-video w-full object-cover" />
      ) : (
        // eslint-disable-next-line jsx-a11y/media-has-caption -- el contrato de M2 (MultimediaDTO) no expone pistas de subtítulos; pendiente de definir con M2
        <video src={hero.url_cdn} controls preload="metadata" aria-label={t("galleryAlt", { name, n: 1 })} className="aspect-video w-full object-cover" />
      )}
      {rest.length > 0 && (
        <ul role="list" className="mt-1 grid grid-cols-2 gap-1">
          {rest.map((m, i) => (
            <li key={m.url_cdn}>
              {m.tipo === "foto" ? (
                // eslint-disable-next-line @next/next/no-img-element -- dominio del CDN (R2) aún sin definir en next.config
                <img src={m.url_cdn} alt={t("galleryAlt", { name, n: i + 2 })} loading="lazy" decoding="async" className="aspect-video w-full object-cover" />
              ) : (
                // eslint-disable-next-line jsx-a11y/media-has-caption -- el contrato de M2 (MultimediaDTO) no expone pistas de subtítulos; pendiente de definir con M2
                <video src={m.url_cdn} controls preload="none" aria-label={t("galleryAlt", { name, n: i + 2 })} className="aspect-video w-full object-cover" />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Atributos dinámicos JSONB (M2 §8.1): solo se renderiza lo que existe ────────────────────────
const CORE_KEYS = new Set(["id", "tipo", "nombre", "descripcion", "categorias", "ubicacion", "precio", "sostenibilidad", "politica_cancelacion", "atributos"]);

export const isPresent = (v: unknown): boolean => {
  if (v === null || v === undefined || v === "") return false;
  if (Array.isArray(v)) return v.some(isPresent);
  if (typeof v === "object") return Object.values(v as object).some(isPresent);
  return true;
};

export function collectAttributes(ficha: FichaCatalogo): [string, unknown][] {
  const extra = Object.fromEntries(Object.entries(ficha).filter(([k]) => !CORE_KEYS.has(k)));
  return Object.entries({ ...extra, ...(ficha.atributos ?? {}) }).filter(([, v]) => isPresent(v));
}

const prettyKey = (key: string) => key.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());

export function DynamicAttributes({ ficha }: { ficha: FichaCatalogo }) {
  const t = useTranslations("catalogo.ficha");
  const locale = useLocale();
  const entries = collectAttributes(ficha);
  if (entries.length === 0) return null; // ninguna fila ni etiqueta vacía en el DOM

  const format = (v: unknown): string => {
    if (typeof v === "boolean") return v ? t("yes") : t("no");
    if (typeof v === "number") return new Intl.NumberFormat(locale).format(v);
    if (typeof v === "string") return /^\d{4}-\d{2}-\d{2}$/.test(v) ? formatDate(v, locale) : v;
    if (Array.isArray(v)) return v.filter(isPresent).map(format).join(", ");
    if (v && typeof v === "object") {
      const rec = v as Record<string, unknown>;
      if (typeof rec["es-CO"] === "string" || typeof rec.es === "string") return localized(rec as Record<string, string>, locale);
      return Object.entries(rec).filter(([, x]) => isPresent(x)).map(([k, x]) => `${prettyKey(k)}: ${format(x)}`).join(" · ");
    }
    return String(v);
  };

  return (
    <section aria-labelledby="atributos-title" className="mt-10">
      <h2 id="atributos-title" className="!text-2xl">
        {t("details")}
      </h2>
      <div className="mt-3">
        <DefinitionRows rows={entries.map(([key, value]) => ({ term: t.has(`attributes.${key}`) ? t(`attributes.${key}`) : prettyKey(key), value: format(value) }))} />
      </div>
    </section>
  );
}

// ── Buenas prácticas ambientales (M8) ───────────────────────────────────────────────────────────
export function BuenasPracticasBlock({ data }: { data: BuenasPracticas | null | undefined }) {
  const t = useTranslations("catalogo.ficha");
  const locale = useLocale();
  if (!data) return null; // 204 / M8 caído → la sección se omite por completo
  return (
    <section aria-labelledby="bp-title" className="mt-10 border-l-4 border-emerald bg-emerald/10 p-5">
      <h2 id="bp-title" className="flex items-center gap-2 !text-2xl">
        <Icon name="leaf" size={24} className="text-emerald-ink" />
        {t("goodPractices")}
      </h2>
      <p className="mt-2 max-w-3xl">{data.contenido}</p>
      <p className="meta mt-2 text-ink/80">{t("published", { date: formatDate(data.fecha_publicacion, locale) })}</p>
    </section>
  );
}

// ── Alternativas descongestivas (M6 · CU-13) ───────────────────────────────────────────────────
export function AlternativesBand({ data }: { data: AlternativasRespuesta | null | undefined }) {
  const t = useTranslations("catalogo.alternatives");
  if (!data || data.alternativas.length === 0) return null;
  return (
    <section aria-labelledby="alt-title" className="mt-10 border-y-2 border-ink bg-mist">
      <div className="px-5 pt-5">
        <h2 id="alt-title" className="!text-2xl">
          {t("title")}
        </h2>
        <p className="mt-1">{data.mensaje_ambiental}</p>
        <p className="meta mt-1 text-ink/80">{t("currentOccupancy", { value: Math.round(data.ocupacion_actual_saturado) })}</p>
      </div>
      <EditorialList label={t("title")}>
        {data.alternativas.map((a, i) => (
          <EditorialRow
            key={a.atractivo_ref}
            index={i + 1}
            title={a.nombre}
            href={`/atractivo/${a.atractivo_ref}`}
            categories={a.categorias}
            explanation={a.explicacion}
            indicator={<SustainabilityIndicator level={levelFromOccupancy(a.ocupacion_estimada)} occupancy={a.ocupacion_estimada} />}
            actionLabel={t("view")}
          />
        ))}
      </EditorialList>
    </section>
  );
}
