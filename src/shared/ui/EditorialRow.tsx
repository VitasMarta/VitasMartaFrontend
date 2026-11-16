import type { ReactNode } from "react";
import { Link } from "@/core/i18n/navigation";
import { Icon } from "./Icon";

/**
 * Fila editorial (guía §1.3-1): franja horizontal de ancho completo separada solo por una línea.
 * Izquierda: numeración · Centro: título, categorías, explicación IA · Derecha: precio, indicador, acción.
 * El título es un enlace "estirado": toda la franja es clicable sin anidar enlaces (a11y).
 */
export interface EditorialRowProps {
  index?: number;
  title: string;
  href: string;
  categories?: string[];
  summary?: string;
  /** Explicación de M6: cursiva con barra lateral Esmeralda. */
  explanation?: string;
  meta?: ReactNode;
  price?: ReactNode;
  indicator?: ReactNode;
  badge?: ReactNode;
  actionLabel: string;
  imageUrl?: string | null;
}

export function EditorialRow({
  index,
  title,
  href,
  categories,
  summary,
  explanation,
  meta,
  price,
  indicator,
  badge,
  actionLabel,
  imageUrl,
}: EditorialRowProps) {
  return (
    <li className="editorial-row relative">
      <article className="mx-auto grid max-w-7xl grid-cols-[auto_1fr] gap-x-5 gap-y-3 px-4 py-6 sm:px-6 md:grid-cols-[auto_1fr_auto] lg:px-8">
        {index !== undefined && (
          <span aria-hidden="true" className="tabular pt-1 text-2xl font-semibold text-ink/80">
            {String(index).padStart(2, "0")}
          </span>
        )}
        <div className="min-w-0 space-y-2">
          <h3>
            <Link href={href} className="text-ink after:absolute after:inset-0 after:content-['']">
              {title}
            </Link>
          </h3>
          {categories && categories.length > 0 && (
            <p className="meta text-ink/80">{categories.join(" · ")}</p>
          )}
          {summary && <p className="max-w-3xl text-ink/90">{summary}</p>}
          {explanation && (
            <p className="max-w-3xl border-l-[3px] border-emerald pl-3 italic">{explanation}</p>
          )}
          {badge}
          {meta && <div className="meta text-ink/80">{meta}</div>}
        </div>
        <div className="col-span-2 flex flex-wrap items-center gap-x-6 gap-y-2 md:col-span-1 md:flex-col md:items-end md:justify-center">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- dominio del CDN (R2) aún sin definir en next.config
            <img src={imageUrl} alt="" loading="lazy" decoding="async" className="hidden h-16 w-28 object-cover md:block" />
          )}
          {price && <p className="tabular text-lg font-semibold">{price}</p>}
          {indicator}
          <span className="inline-flex items-center gap-1 font-semibold text-ink underline underline-offset-4">
            {actionLabel}
            <Icon name="arrow" />
          </span>
        </div>
      </article>
    </li>
  );
}

/** Contenedor semántico de filas: `<ul role="list">` (guía §4-2). */
export function EditorialList({ children, label }: { children: ReactNode; label: string }) {
  return (
    <ul role="list" aria-label={label} className="border-t border-ink/15">
      {children}
    </ul>
  );
}
