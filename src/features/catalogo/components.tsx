"use client";

import { useLocale, useTranslations } from "next-intl";
import { Link } from "@/core/i18n/navigation";
import type {
  AlternativasRespuesta,
  BuenasPracticas,
  FichaCatalogo,
  MultimediaDTO,
  NivelSaturacion,
} from "@/core/api/types";
import { formatCOP, formatDate, localized } from "@/core/format";
import { cn } from "@/shared/ui/cn";
import { Icon } from "@/shared/ui/Icon";
import { SustainabilityIndicator, levelFromOccupancy } from "@/shared/ui/indicators";
import { useBusqueda, useMultimedia, useRecomendaciones } from "./api";
import { useSessionStore } from "@/core/auth/sessionStore";
import { DestinoImagen, ocupacionDe } from "./cards";

// ── Banda de recomendaciones (M6) ──────────────────────────────────────────────────────────────
// Con sesión: M6 (personalizada con IA si hay perfilado + intereses; si no, reglas). Sin sesión M6
// no responde (exige JWT): se muestran los destinos más sostenibles de M2 con una invitación a entrar.
interface ItemBanda {
  id: string;
  nombre: string;
  categorias: string[];
  explicacion?: string;
  sostenible?: boolean;
  nivel?: NivelSaturacion;
  ocupacion?: number;
  /** M2 trae la imagen en la búsqueda; M6 no, y se toma de la galería del destino. */
  imagen?: string | null;
}

function FotoRecomendacion({ item }: { item: ItemBanda }) {
  const media = useMultimedia(item.id, item.imagen === undefined);
  const src = item.imagen ?? media.data?.find((m) => m.tipo === "foto")?.url_cdn;
  return <DestinoImagen src={src} alt={item.nombre} />;
}

export function RecommendationsBand() {
  const t = useTranslations("catalogo.ai");
  const locale = useLocale();
  const status = useSessionStore((s) => s.status);
  const rol = useSessionStore((s) => s.user?.rol);
  const { data } = useRecomendaciones(5);
  const anonimo = status === "anonymous";
  const general = useBusqueda({ orden: "sostenibilidad" }, 4, anonimo);

  let items: ItemBanda[] = [];
  if (anonimo) {
    items = (general.data?.pages[0]?.items ?? []).map((i) => {
      const o = ocupacionDe(i);
      return { id: i.id, nombre: localized(i.nombre, locale), categorias: i.categorias ?? [], imagen: i.imagen_url ?? null, nivel: o?.level, ocupacion: o?.value };
    });
  } else if (rol === "TURISTA" && data) {
    items = data.items.map((i) => ({
      id: i.atractivo_ref, nombre: i.nombre, categorias: i.categorias, explicacion: i.explicacion,
      sostenible: i.sostenibilidad.es_alternativa_sostenible, nivel: i.sostenibilidad.nivel_saturacion, ocupacion: i.sostenibilidad.ocupacion_estimada,
    }));
  }
  if (items.length === 0) return null; // M6 caído o sin datos: se oculta

  const personalized = !anonimo && data?.estado_respuesta === "PERSONALIZADA";
  // Turista sin personalización por decisión/cold-start (no por caída de la IA): se le invita a configurarla.
  const invitar = !anonimo && data?.estado_respuesta === "ESTANDAR_SIN_PERFILADO";
  return (
    <section aria-labelledby="ia-title" className="mx-auto max-w-7xl px-4 pt-10 sm:px-6 lg:px-8">
      <p className="inline-flex items-center gap-2 font-semibold text-emerald-ink">
        <Icon name="spark" />
        {personalized ? t("seal") : t("sealGeneral")}
      </p>
      <div className="mt-1 flex flex-wrap items-end justify-between gap-3">
        <h2 id="ia-title" className="!text-2xl">{personalized ? t("title") : t("titleGeneral")}</h2>
        {personalized && (
          <Link href="/mi-perfil?seccion=consentimientos" className="text-link font-semibold">
            {t("configure")}
          </Link>
        )}
      </div>
      {anonimo ? (
        <p className="mt-1 max-w-3xl text-ink/90">
          {t("anonIntro")}{" "}
          <Link href="/login" className="text-link font-semibold">{t("login")}</Link>
        </p>
      ) : (
        <p className="mt-1 max-w-3xl text-ink/90">{data?.aviso_transparencia_ia}</p>
      )}
      {data?.degradada && !anonimo && <p className="meta mt-1 font-semibold text-ink/80">{t("fallbackTag")}</p>}
      {invitar && (
        <p className="card mt-4 flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3">
          <Icon name="spark" className="text-emerald-ink" />
          <span>{t("nudge")}</span>
          <Link href="/mi-perfil?seccion=intereses" className="text-link font-semibold">{t("nudgeLink")}</Link>
        </p>
      )}
      <ul role="list" aria-label={personalized ? t("title") : t("titleGeneral")} className="mt-4 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
        {items.map((item) => (
          <li key={item.id} className="card card-hover relative flex flex-col overflow-hidden">
            <div className="relative aspect-[4/3] w-full shrink-0 overflow-hidden">
              <FotoRecomendacion item={item} />
            </div>
            <div className="flex flex-1 flex-col gap-2 p-4">
              <h3 className="line-clamp-2 min-h-[2.75em] !text-lg leading-snug" title={item.nombre}>
                <Link href={`/atractivo/${item.id}`} className="text-ink after:absolute after:inset-0 after:content-[''] hover:text-action">
                  {item.nombre}
                </Link>
              </h3>
              {item.categorias.length > 0 && <p className="meta truncate text-ink/80">{item.categorias.join(" · ")}</p>}
              {item.explicacion && <p className="border-l-[3px] border-emerald pl-3 text-sm italic">{item.explicacion}</p>}
              {item.sostenible && (
                <p className="meta inline-flex items-center gap-1.5 font-semibold text-emerald-ink">
                  <Icon name="leaf" size={16} />
                  {t("sustainable")}
                </p>
              )}
              {item.nivel && (
                <div className="mt-auto pt-1">
                  <SustainabilityIndicator level={item.nivel} occupancy={item.ocupacion} />
                </div>
              )}
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
      <section aria-label={t("gallery")} className="relative aspect-[16/9] overflow-hidden rounded-lg">
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
const CORE_KEYS = new Set(["id", "tipo", "nombre", "descripcion", "categorias", "ubicacion", "precio", "sostenibilidad", "politica_cancelacion", "atributos", "multimedia", "rango_precio", "idioma", "frescura", "desde_cache"]);

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
    <section aria-labelledby="atributos-title">
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
            <dd className="break-words pl-7 text-ink/90">{format(value)}</dd>
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
    <section aria-labelledby="bp-title" className="card border-l-4 !border-l-emerald p-5">
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
    <section aria-labelledby="alt-title" className="card p-5">
      <h2 id="alt-title" className="!text-2xl">
        {t("title")}
      </h2>
      <p className="mt-1">{data.mensaje_ambiental}</p>
      <p className="meta mt-1 text-ink/80">{t("currentOccupancy", { value: Math.round(data.ocupacion_actual_saturado) })}</p>
      <ul role="list" aria-label={t("title")} className="mt-4 grid gap-4 sm:grid-cols-2">
        {data.alternativas.map((a) => (
          <li key={a.atractivo_ref} className="card card-hover relative flex gap-3 overflow-hidden p-3">
            <div className="relative h-24 w-28 shrink-0 overflow-hidden rounded-md">
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
