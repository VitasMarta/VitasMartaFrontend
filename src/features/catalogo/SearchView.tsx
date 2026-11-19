"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { formatDateTime, localized } from "@/core/format";
import { Link, usePathname, useRouter } from "@/core/i18n/navigation";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { cn } from "@/shared/ui/cn";
import { Icon } from "@/shared/ui/Icon";
import { SelectField, TextField } from "@/shared/ui/forms";
import { Container } from "@/shared/ui/layout";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { useBusqueda, useCategorias, type BusquedaFiltros } from "./api";
import { ResultadoCard } from "./cards";
import { SearchBar } from "./SearchBar";

const ORDERS: NonNullable<BusquedaFiltros["orden"]>[] = ["relevancia", "nombre", "distancia", "precio", "popularidad", "sostenibilidad"];

function parse(params: URLSearchParams): BusquedaFiltros {
  const num = (k: string) => (params.get(k) ? Number(params.get(k)) : undefined);
  return {
    texto: params.get("texto") ?? undefined,
    categorias: params.getAll("categorias"),
    precio_minimo: num("precio_minimo"),
    precio_maximo: num("precio_maximo"),
    orden: (params.get("orden") as BusquedaFiltros["orden"]) ?? undefined,
    descendente: params.get("descendente") === "true" || undefined,
    lat: num("lat"),
    lng: num("lng"),
    radio_km: num("radio_km"),
  };
}

function serialize(f: BusquedaFiltros): string {
  const p = new URLSearchParams();
  for (const [k, v] of Object.entries(f)) {
    if (v === undefined || v === "" || (Array.isArray(v) && v.length === 0) || Number.isNaN(v)) continue;
    if (Array.isArray(v)) v.forEach((x) => p.append(k, x));
    else p.set(k, String(v));
  }
  return p.toString();
}

/** Catálogo (M2): filtros en la URL, cambiar `orden` conserva los filtros activos (RF-01-6). */
export function SearchView() {
  const t = useTranslations("catalogo.search");
  const tl = useTranslations("catalogo.layout");
  const tc = useTranslations("common");
  const locale = useLocale();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const filtros = useMemo(() => parse(new URLSearchParams(searchParams.toString())), [searchParams]);
  // Estado local de categorías: respuesta inmediata al marcar; la URL se actualiza justo después.
  const urlCategorias = filtros.categorias?.join(",") ?? "";
  const [cats, setCats] = useState<string[]>(filtros.categorias ?? []);
  useEffect(() => setCats(urlCategorias ? urlCategorias.split(",") : []), [urlCategorias]);
  const [geoError, setGeoError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);
  // En móvil los filtros se pliegan en un desplegable; en escritorio siempre están a la vista.
  const [filtrosAbiertos, setFiltrosAbiertos] = useState(false);
  useDocumentTitle(t("title"));

  const categorias = useCategorias();
  const busqueda = useBusqueda(filtros);
  const items = busqueda.data?.pages.flatMap((p) => p.items) ?? [];
  const first = busqueda.data?.pages[0];

  const apply = (patch: Partial<BusquedaFiltros>) => {
    const qs = serialize({ ...filtros, ...patch });
    router.replace(qs ? `${pathname}?${qs}` : pathname, { scroll: false });
  };

  const onSubmit = (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const f = new FormData(e.currentTarget);
    const n = (k: string) => (f.get(k) ? Number(f.get(k)) : undefined);
    apply({ texto: (f.get("texto") as string) || undefined, precio_minimo: n("precio_minimo"), precio_maximo: n("precio_maximo"), radio_km: n("radio_km") });
    setFiltrosAbiertos(false); // en móvil se cierra para ver los resultados
  };

  const toggleCategoria = (slug: string) => {
    const set = new Set(cats);
    if (set.has(slug)) set.delete(slug);
    else set.add(slug);
    setCats([...set]);
    apply({ categorias: [...set] });
  };

  const useLocation = () => {
    setGeoError(null);
    if (!navigator.geolocation) return setGeoError(t("locationError"));
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        setLocating(false);
        apply({ lat: Number(pos.coords.latitude.toFixed(5)), lng: Number(pos.coords.longitude.toFixed(5)), radio_km: filtros.radio_km ?? 15, orden: "distancia" });
      },
      () => {
        setLocating(false);
        setGeoError(t("locationError"));
      },
      { timeout: 8000 },
    );
  };

  const hasFilters = !!(filtros.texto || filtros.categorias?.length || filtros.precio_minimo || filtros.precio_maximo || filtros.lat);
  const filtrosActivos = (filtros.categorias?.length ?? 0) + [filtros.precio_minimo, filtros.precio_maximo, filtros.radio_km].filter((v) => v != null).length;
  const formKey = serialize({ ...filtros, orden: undefined, descendente: undefined, categorias: undefined });

  return (
    <>
      <section className="on-ink bg-ink pb-12 pt-4 text-on-action">
        <Container>
          <h1 className="sr-only">{t("title")}</h1>
        </Container>
      </section>
      <Container className="-mt-10">
        <SearchBar
          texto={filtros.texto}
          categoria={filtros.categorias?.length === 1 ? filtros.categorias[0] : undefined}
          onSearch={(v) => apply({ texto: v.texto, categorias: v.categoria ? [v.categoria] : [] })}
        />
      </Container>

      <Container className="pt-5">
        <nav aria-label="breadcrumb" className="meta">
          <ol className="flex flex-wrap items-center gap-2 text-ink/80">
            <li><Link href="/" className="text-link">{tl("breadcrumbHome")}</Link></li>
            <li aria-hidden="true">›</li>
            <li aria-current="page">{tl("breadcrumbSearch")}</li>
          </ol>
        </nav>
      </Container>

      <Container className="grid gap-6 py-5 lg:grid-cols-[280px_1fr]">
        {/* ── Filtros ── */}
        <aside aria-labelledby="filtros-title" className="card h-fit self-start">
          <h2 id="filtros-title" className="!text-lg">
            {/* Botón del desplegable en móvil; en escritorio es solo el encabezado. */}
            <button
              type="button"
              aria-expanded={filtrosAbiertos}
              aria-controls="filtros-cuerpo"
              onClick={() => setFiltrosAbiertos((v) => !v)}
              className={cn("flex min-h-12 w-full items-center gap-2 px-4 py-3 text-left lg:pointer-events-none lg:border-b lg:border-line", filtrosAbiertos && "border-b border-line")}
            >
              <span className="flex-1">{tl("filterBy")}</span>
              {filtrosActivos > 0 && <span className="tabular rounded-full bg-action px-2 py-0.5 text-xs font-semibold text-on-action">{filtrosActivos}</span>}
              <Icon name="chevron" size={18} className={cn("transition-transform lg:hidden", filtrosAbiertos ? "-rotate-90" : "rotate-90")} />
            </button>
          </h2>
          <div id="filtros-cuerpo" className={cn(filtrosAbiertos ? "block" : "hidden", "lg:block")}>
            <form key={formKey} onSubmit={onSubmit} aria-label={tl("filterBy")} className="space-y-4 border-b border-line p-4">
              <p className="font-semibold">{tl("budget")}</p>
              <div className="grid grid-cols-2 gap-3">
                <TextField label={t("priceMin")} name="precio_minimo" type="number" min={0} step={1000} defaultValue={filtros.precio_minimo} />
                <TextField label={t("priceMax")} name="precio_maximo" type="number" min={0} step={1000} defaultValue={filtros.precio_maximo} />
              </div>
              <TextField label={t("radius")} name="radio_km" type="number" min={1} defaultValue={filtros.radio_km} hint={filtros.lat ? t("locationActive") : undefined} />
              <input type="hidden" name="texto" value={filtros.texto ?? ""} />
              <Button type="submit" variant="secondary" className="w-full">{t("apply")}</Button>
              <Button variant="ghost" onClick={useLocation} loading={locating} className="w-full">
                {locating ? t("locating") : t("useLocation")}
              </Button>
              {geoError && (
                <p role="alert" className="text-sm font-medium text-critical">
                  {geoError}
                </p>
              )}
            </form>
            <fieldset className="min-w-0 p-4">
              <legend className="mb-2 px-0 font-semibold">{t("categories")}</legend>
              <div className="flex flex-col">
                {categorias.data?.map((c) => (
                  <label key={c.slug} className="inline-flex min-h-11 cursor-pointer items-center gap-3">
                    <input type="checkbox" className="size-5 accent-action" checked={cats.includes(c.slug)} onChange={() => toggleCategoria(c.slug)} />
                    {localized(c.nombre, locale)}
                  </label>
                ))}
              </div>
            </fieldset>
            {hasFilters && (
              <div className="border-t border-line p-4">
                <Button variant="ghost" className="w-full" onClick={() => router.replace(pathname, { scroll: false })}>
                  {t("clearAll")}
                </Button>
              </div>
            )}
          </div>
        </aside>

        {/* ── Resultados ── */}
        <section aria-labelledby="resultados-title" className="min-w-0">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <h2 id="resultados-title" aria-live="polite" className="!text-2xl">
              {first ? tl("found", { count: first.total }) : t("title")}
            </h2>
            <div className="flex flex-wrap items-end gap-3">
              <SelectField label={t("orderBy")} name="orden" value={filtros.orden ?? "relevancia"} onChange={(e) => apply({ orden: e.target.value as BusquedaFiltros["orden"] })}>
                {ORDERS.map((o) => (
                  <option key={o} value={o}>
                    {t(`orders.${o}`)}
                  </option>
                ))}
              </SelectField>
              <label className="inline-flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-5 accent-action" checked={!!filtros.descendente} onChange={(e) => apply({ descendente: e.target.checked || undefined })} />
                {t("descending")}
              </label>
            </div>
          </div>
          {first?.desde_cache && first.frescura_ultima_actualizacion && (
            <p role="status" className="mt-3 border-l-4 border-preventive pl-3 text-sm font-medium">
              {t("cacheNotice", { date: formatDateTime(first.frescura_ultima_actualizacion, locale) })}
            </p>
          )}

          <div className="mt-4">
            {busqueda.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
            {busqueda.isError && <ErrorNotice error={busqueda.error} referenceLabel={tc("reference")} />}
            {first && items.length === 0 && (
              <StatusBlock kind="empty" title={t("empty")}>
                <p>{t("emptyHint")}</p>
              </StatusBlock>
            )}
            {items.length > 0 && (
              <ul role="list" aria-label={t("title")} className="space-y-4">
                {items.map((item) => (
                  <ResultadoCard key={item.id} item={item} />
                ))}
              </ul>
            )}
          </div>

          {busqueda.hasNextPage && (
            <div className="py-8 text-center">
              <Button variant="secondary" onClick={() => busqueda.fetchNextPage()} loading={busqueda.isFetchingNextPage}>
                {t("loadMore")}
              </Button>
            </div>
          )}
        </section>
      </Container>
    </>
  );
}
