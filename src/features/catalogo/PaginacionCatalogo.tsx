"use client";

import { useTranslations } from "next-intl";
import { Link } from "@/core/i18n/navigation";
import { cn } from "@/shared/ui/cn";
import { Icon } from "@/shared/ui/Icon";

/**
 * Números a mostrar: primera, última, la actual y sus vecinas; los saltos se marcan con `null` (…).
 * Ej.: 15 páginas, actual 7 → 1 … 6 7 8 … 15.
 */
export function rangoPaginas(actual: number, total: number, vecinas = 1): (number | null)[] {
  if (total <= 7) return Array.from({ length: total }, (_, i) => i + 1);
  const desde = Math.max(2, actual - vecinas);
  const hasta = Math.min(total - 1, actual + vecinas);
  const r: (number | null)[] = [1];
  if (desde > 2) r.push(null);
  for (let p = desde; p <= hasta; p++) r.push(p);
  if (hasta < total - 1) r.push(null);
  r.push(total);
  return r;
}

const BASE = "inline-flex min-h-11 min-w-9 items-center justify-center rounded-md px-1.5 font-semibold transition-colors sm:min-w-11 sm:px-3";

/** Paginación numerada del catálogo: enlaces reales (`?pagina=N`), se pueden abrir en otra pestaña. */
export function PaginacionCatalogo({ pagina, paginas, href }: { pagina: number; paginas: number; href: (pagina: number) => string }) {
  const t = useTranslations("catalogo.search.pages");
  if (paginas <= 1) return null;
  const extremo = (destino: number, etiqueta: string, icono: "prev" | "next") => {
    const contenido = (
      <>
        {icono === "prev" && <Icon name="chevron" size={18} className="rotate-180" />}
        <span className="hidden sm:inline">{etiqueta}</span>
        {icono === "next" && <Icon name="chevron" size={18} />}
      </>
    );
    const deshabilitado = destino < 1 || destino > paginas;
    return deshabilitado ? (
      <span aria-disabled="true" className={cn(BASE, "gap-1 text-ink/35")}>{contenido}</span>
    ) : (
      <Link href={href(destino)} aria-label={etiqueta} className={cn(BASE, "gap-1 text-action hover:bg-action/10")}>
        {contenido}
      </Link>
    );
  };

  return (
    <nav aria-label={t("label")} className="mt-8 flex flex-wrap items-center justify-center gap-0.5 sm:gap-1">
      {extremo(pagina - 1, t("previous"), "prev")}
      {rangoPaginas(pagina, paginas).map((p, i) =>
        p === null ? (
          <span key={`salto-${i}`} aria-hidden="true" className="px-1 text-ink/60">…</span>
        ) : p === pagina ? (
          <span key={p} aria-current="page" aria-label={t("page", { page: p })} className={cn(BASE, "tabular bg-action text-on-action")}>
            {p}
          </span>
        ) : (
          <Link key={p} href={href(p)} aria-label={t("page", { page: p })} className={cn(BASE, "tabular text-ink hover:bg-action/10 hover:text-action")}>
            {p}
          </Link>
        ),
      )}
      {extremo(pagina + 1, t("next"), "next")}
    </nav>
  );
}
