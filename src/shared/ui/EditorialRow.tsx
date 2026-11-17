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
    <li className="card card-hover relative flex">
      <article className="grid w-full grid-cols-[auto_1fr] content-between gap-x-4 gap-y-3 p-5">
        {index !== undefined && (
          <span aria-hidden="true" className="tabular inline-flex size-10 items-center justify-center rounded-full bg-page text-sm font-bold text-action">
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
        <div className="col-span-2 flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-line pt-3">
          {imageUrl && (
            // eslint-disable-next-line @next/next/no-img-element -- dominio del CDN (R2) aún sin definir en next.config
            <img src={imageUrl} alt="" loading="lazy" decoding="async" className="hidden h-16 w-28 rounded object-cover md:block" />
          )}
          {price && <p className="tabular text-lg font-semibold">{price}</p>}
          {indicator}
          <span className="ml-auto inline-flex items-center gap-1 font-semibold text-action">
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
    <ul role="list" aria-label={label} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
      {children}
    </ul>
  );
}
