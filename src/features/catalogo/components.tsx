"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/core/i18n/navigation";
import type {
  AlternativasRespuesta,
  BuenasPracticas,
  FichaCatalogo,
  MultimediaDTO,
} from "@/core/api/types";
import { formatCOP, formatDate, localized } from "@/core/format";
import { cn } from "@/shared/ui/cn";
import { Icon } from "@/shared/ui/Icon";
import { SustainabilityIndicator, levelFromOccupancy } from "@/shared/ui/indicators";
import { useRecomendaciones } from "./api";
import { useSessionStore } from "@/core/auth/sessionStore";
import { DestinoImagen } from "./cards";

// ── Banda de recomendaciones IA (M6) ────────────────────────────────────────────────────────────
export function RecommendationsBand() {
  const t = useTranslations("catalogo.ai");
  const rol = useSessionStore((s) => s.user?.rol);
  const { data } = useRecomendaciones(5);
  if (rol !== "TURISTA" || !data || data.items.length === 0) return null; // M6 caído o sin datos: se oculta

  const personalized = data.estado_respuesta === "PERSONALIZADA";
  return (
    <section aria-labelledby="ia-title" className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
      <p className="inline-flex items-center gap-2 font-semibold text-emerald-ink">
        <Icon name="spark" />
        {personalized ? t("seal") : t("sealGeneral")}
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h2 id="ia-title" className="!text-2xl">{t("title")}</h2>
        <Link href="/mi-perfil?seccion=consentimientos" className="text-link font-semibold">
          {t("configure")}
        </Link>
      </div>
      <p className="mt-1 max-w-3xl text-ink/90">{data.aviso_transparencia_ia}</p>
      {data.degradada && <p className="meta mt-1 font-semibold text-ink/80">{t("fallbackTag")}</p>}
      <ul role="list" aria-label={t("title")} className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {data.items.map((item) => (
          <li key={item.atractivo_ref} className="card card-hover relative flex flex-col overflow-hidden">
            <div className="aspect-[4/3] w-full">
              <DestinoImagen alt={item.nombre} />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="!text-lg leading-snug">
                <Link href={`/atractivo/${item.atractivo_ref}`} className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-action">
                  {item.nombre}
                </Link>
              </h3>
              {item.categorias.length > 0 && <p className="meta text-ink/80">{item.categorias.join(" · ")}</p>}
              {item.explicacion && <p className="border-l-[3px] border-emerald pl-3 text-sm italic">{item.explicacion}</p>}
              {item.sostenibilidad.es_alternativa_sostenible && (
                <p className="meta inline-flex items-center gap-1.5 font-semibold text-emerald-ink">
                  <Icon name="leaf" size={16} />
                  {t("sustainable")}
                </p>
              )}
              <div className="mt-auto pt-1">
                <SustainabilityIndicator level={item.sostenibilidad.nivel_saturacion} occupancy={item.sostenibilidad.ocupacion_estimada} />
              </div>
            </div>
          </li>
        ))}
      </ul>
    </section>
  );
}

// ── Galería en rejilla (Cloudflare R2): foto principal grande + laterales + miniaturas ────────────
function Medio({ m, alt, prioridad, className }: { m: MultimediaDTO; alt: string; prioridad?: boolean; className?: string }) {
  return m.tipo === "foto" ? (
    // eslint-disable-next-line @next/next/no-img-element -- dominio del CDN (R2) aún sin definir en next.config
    <img src={m.url_cdn} alt={alt} fetchPriority={prioridad ? "high" : undefined} loading={prioridad ? "eager" : "lazy"} decoding="async" className={cn("h-full w-full rounded-md object-cover", className)} />
  ) : (
    // eslint-disable-next-line jsx-a11y/media-has-caption -- el contrato de M2 (MultimediaDTO) no expone pistas de subtítulos; pendiente de definir con M2
    <video src={m.url_cdn} controls preload="metadata" aria-label={alt} className={cn("h-full w-full rounded-md object-cover", className)} />
  );
}

export function Gallery({ media, name }: { media: MultimediaDTO[]; name: string }) {
  const t = useTranslations("catalogo.ficha");
  if (media.length === 0)
    return (
      <section aria-label={t("gallery")} className="aspect-[16/9] overflow-hidden rounded-lg">
        <DestinoImagen alt={name} />
      </section>
    );
  const [hero, ...rest] = media;
  const laterales = rest.slice(0, 2);
  const miniaturas = rest.slice(2, 7);
  return (
    <section aria-label={t("gallery")} className="space-y-2">
      <div className={cn("grid gap-2", laterales.length ? "md:grid-cols-[2fr_1fr]" : "")}>
        <div className="aspect-[4/3] md:aspect-auto md:h-[26rem]"><Medio m={hero} alt={t("galleryAlt", { name, n: 1 })} prioridad /></div>
        {laterales.length > 0 && (
          <ul role="list" className="grid grid-cols-2 gap-2 md:grid-cols-1 md:grid-rows-2">
            {laterales.map((m, i) => (
              <li key={m.url_cdn} className="aspect-[4/3] md:aspect-auto md:h-[12.75rem]"><Medio m={m} alt={t("galleryAlt", { name, n: i + 2 })} /></li>
            ))}
          </ul>
        )}
      </div>
      {miniaturas.length > 0 && (
        <ul role="list" className="grid grid-cols-3 gap-2 sm:grid-cols-5">
          {miniaturas.map((m, i) => (
            <li key={m.url_cdn} className="aspect-[4/3]"><Medio m={m} alt={t("galleryAlt", { name, n: i + 4 })} /></li>
          ))}
        </ul>
      )}
    </section>
  );
}

// ── Atributos dinámicos JSONB (M2 §8.1): solo se renderiza lo que existe ────────────────────────
// Claves propias de la ficha y metadatos de la respuesta de M2 (idioma, frescura, caché): no son atributos del destino.
const CORE_KEYS = new Set(["id", "tipo", "nombre", "descripcion", "categorias", "ubicacion", "precio", "sostenibilidad", "politica_cancelacion", "atributos", "idioma", "frescura", "desde_cache"]);

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
  const tl = useTranslations("catalogo.layout");
  const locale = useLocale();
  const entries = collectAttributes(ficha);
  if (entries.length === 0) return null; // ninguna fila ni etiqueta vacía en el DOM

  const DIAS = ["L", "M", "X", "J", "V", "S", "D"];
  const format = (v: unknown): string => {
    // Tarifas de M4: [{ concepto, precio: { monto, moneda } }] → "Entrada: $ 8.000".
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && "precio" in (x as object))) {
      return v
        .map((x) => {
          const r = x as { concepto?: unknown; precio?: { monto?: unknown } };
          const monto = Number(r.precio?.monto);
          const concepto = format(r.concepto);
          return `${concepto ? `${concepto}: ` : ""}${Number.isFinite(monto) ? formatCOP(monto, locale) : "—"}`;
        })
        .join(" · ");
    }
    // Horarios de M4: [{ dia_semana 0..6, hora_inicio, hora_fin }] → "L–D 08:00–17:00".
    if (Array.isArray(v) && v.length && v.every((x) => x && typeof x === "object" && "dia_semana" in (x as object))) {
      const hs = v as { dia_semana: number; hora_inicio: string; hora_fin: string }[];
      const mismos = hs.every((h) => h.hora_inicio === hs[0].hora_inicio && h.hora_fin === hs[0].hora_fin);
      if (mismos) {
        const dias = hs.map((h) => h.dia_semana).sort();
        const rango = dias.length === 7 ? `${DIAS[0]}–${DIAS[6]}` : dias.map((d) => DIAS[d]).join(", ");
        return `${rango} ${hs[0].hora_inicio}–${hs[0].hora_fin}`;
      }
      return hs.map((h) => `${DIAS[h.dia_semana]} ${h.hora_inicio}–${h.hora_fin}`).join(" · ");
    }
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
    <section aria-labelledby="atributos-title" className="mt-6">
      <h2 id="atributos-title" className="!text-2xl">
        {tl("highlights")}
      </h2>
      <dl className="mt-3 grid gap-3 sm:grid-cols-2">
        {entries.map(([key, value]) => (
          <div key={key} className="card p-4">
            <dt className="flex items-center gap-2 font-semibold">
              <Icon name="check" className="shrink-0 text-emerald-ink" />
              {t.has(`attributes.${key}`) ? t(`attributes.${key}`) : prettyKey(key)}
            </dt>
            <dd className="pl-7 text-ink/90">{format(value)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

// ── Buenas prácticas ambientales (M8) ───────────────────────────────────────────────────────────
export function BuenasPracticasBlock({ data }: { data: BuenasPracticas | null | undefined }) {
  const t = useTranslations("catalogo.ficha");
  const locale = useLocale();
  if (!data) return null; // 204 / M8 caído → la sección se omite por completo
  return (
    <section aria-labelledby="bp-title" className="card mt-6 border-l-4 !border-l-emerald p-5">
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
    <section aria-labelledby="alt-title" className="card mt-10 p-5">
      <h2 id="alt-title" className="!text-2xl">
        {t("title")}
      </h2>
      <p className="mt-1">{data.mensaje_ambiental}</p>
      <p className="meta mt-1 text-ink/80">{t("currentOccupancy", { value: Math.round(data.ocupacion_actual_saturado) })}</p>
      <ul role="list" aria-label={t("title")} className="mt-4 grid gap-4 sm:grid-cols-2">
        {data.alternativas.map((a) => (
          <li key={a.atractivo_ref} className="card card-hover relative flex gap-3 overflow-hidden p-3">
            <div className="h-24 w-28 shrink-0 overflow-hidden rounded-md">
              <DestinoImagen alt={a.nombre} />
            </div>
            <div className="min-w-0 space-y-1">
              <h3 className="!text-[1rem]">
                <Link href={`/atractivo/${a.atractivo_ref}`} className="text-action after:absolute after:inset-0 after:content-[''] hover:underline">
                  {a.nombre}
                </Link>
              </h3>
              {a.categorias.length > 0 && <p className="meta text-ink/80">{a.categorias.join(" · ")}</p>}
              <p className="text-sm">{a.explicacion}</p>
              <SustainabilityIndicator level={levelFromOccupancy(a.ocupacion_estimada)} occupancy={a.ocupacion_estimada} />
            </div>
          </li>
        ))}
      </ul>
      <span className="sr-only">{t("view")}</span>
    </section>
  );
}
