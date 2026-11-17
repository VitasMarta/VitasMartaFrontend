"use client";

import type { FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { localized } from "@/core/format";
import { useRouter } from "@/core/i18n/navigation";
import { Icon } from "@/shared/ui/Icon";
import { useCategorias } from "./api";

/**
 * Buscador destacado (portada y resultados): texto libre + categoría + botón. Navega a /buscar con los
 * filtros en la URL; en la página de resultados conserva el resto de filtros activos.
 */
export function SearchBar({ texto, categoria, onSearch }: { texto?: string; categoria?: string; onSearch?: (v: { texto?: string; categoria?: string }) => void }) {
  const t = useTranslations("catalogo.bar");
  const locale = useLocale();
  const router = useRouter();
  const categorias = useCategorias();

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const v = { texto: String(f.get("texto") ?? "").trim() || undefined, categoria: String(f.get("categoria") ?? "") || undefined };
    if (onSearch) return onSearch(v);
    const p = new URLSearchParams();
    if (v.texto) p.set("texto", v.texto);
    if (v.categoria) p.set("categorias", v.categoria);
    router.push(`/buscar${p.size ? `?${p}` : ""}`);
  };

  return (
    <form key={`${texto ?? ""}|${categoria ?? ""}`} onSubmit={onSubmit} role="search" aria-label={t("where")} className="search-frame">
      <div className="grid gap-1 md:grid-cols-[2fr_1fr_auto]">
        <label className="flex min-h-16 items-center gap-3 rounded-md bg-card px-4">
          <Icon name="search" size={22} className="shrink-0 text-ink" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="meta text-ink/80">{t("where")}</span>
            <input name="texto" type="search" defaultValue={texto} placeholder={t("wherePlaceholder")} className="w-full bg-transparent text-[1rem] font-semibold text-ink placeholder:font-normal placeholder:text-ink/70 focus-visible:outline-offset-4" />
          </span>
        </label>
        <label className="flex min-h-16 items-center gap-3 rounded-md bg-card px-4">
          <Icon name="leaf" size={22} className="shrink-0 text-ink" />
          <span className="flex min-w-0 flex-1 flex-col">
            <span className="meta text-ink/80">{t("category")}</span>
            <select name="categoria" defaultValue={categoria ?? ""} className="w-full bg-transparent font-semibold text-ink focus-visible:outline-offset-4">
              <option value="">{t("anyCategory")}</option>
              {categorias.data?.map((c) => (
                <option key={c.slug} value={c.slug}>{localized(c.nombre, locale)}</option>
              ))}
            </select>
          </span>
        </label>
        <button type="submit" className="min-h-16 rounded-md bg-action px-8 text-lg font-bold text-on-action hover:bg-action-strong">
          {t("submit")}
        </button>
      </div>
    </form>
  );
}
