"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { formatDateTime, localized } from "@/core/format";
import { usePathname, useRouter } from "@/core/i18n/navigation";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { SelectField, TextField } from "@/shared/ui/forms";
import { Band, Container, PageHeader } from "@/shared/ui/layout";
import { ErrorNotice, StatusBlock } from "@/shared/ui/StatusBlock";
import { useBusqueda, useCategorias, type BusquedaFiltros } from "./api";
import { CatalogRows } from "./components";

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
  const formKey = serialize({ ...filtros, orden: undefined, descendente: undefined, categorias: undefined });

  return (
    <>
      <PageHeader title={t("title")} description={t("description")} />

      <Band tone="base" className="border-b border-ink/15">
        <Container className="py-6">
          <form key={formKey} onSubmit={onSubmit} role="search" aria-label={t("title")} className="grid gap-4 md:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
            <TextField label={t("text")} name="texto" type="search" defaultValue={filtros.texto} placeholder={t("textPlaceholder")} />
            <TextField label={t("priceMin")} name="precio_minimo" type="number" min={0} step={1000} defaultValue={filtros.precio_minimo} />
            <TextField label={t("priceMax")} name="precio_maximo" type="number" min={0} step={1000} defaultValue={filtros.precio_maximo} />
            <TextField label={t("radius")} name="radio_km" type="number" min={1} defaultValue={filtros.radio_km} hint={filtros.lat ? t("locationActive") : undefined} />
            <Button type="submit">{tc("search")}</Button>
          </form>

          <div className="mt-5 flex flex-wrap items-end justify-between gap-4">
            <fieldset className="min-w-0">
              <legend className="mb-2 text-sm font-semibold">{t("categories")}</legend>
              <div className="flex flex-wrap gap-x-6 gap-y-2">
                {categorias.data?.map((c) => (
                  <label key={c.slug} className="inline-flex min-h-11 cursor-pointer items-center gap-2">
                    <input type="checkbox" className="size-5 accent-ink" checked={cats.includes(c.slug)} onChange={() => toggleCategoria(c.slug)} />
                    {localized(c.nombre, locale)}
                  </label>
                ))}
              </div>
            </fieldset>

            <div className="flex flex-wrap items-end gap-4">
              <SelectField label={t("orderBy")} name="orden" value={filtros.orden ?? "relevancia"} onChange={(e) => apply({ orden: e.target.value as BusquedaFiltros["orden"] })}>
                {ORDERS.map((o) => (
                  <option key={o} value={o}>
                    {t(`orders.${o}`)}
                  </option>
                ))}
              </SelectField>
              <label className="inline-flex min-h-11 items-center gap-2">
                <input type="checkbox" className="size-5 accent-ink" checked={!!filtros.descendente} onChange={(e) => apply({ descendente: e.target.checked || undefined })} />
                {t("descending")}
              </label>
              <Button variant="secondary" onClick={useLocation} loading={locating}>
                {locating ? t("locating") : t("useLocation")}
              </Button>
              {hasFilters && (
                <Button variant="ghost" onClick={() => router.replace(pathname, { scroll: false })}>
                  {t("clearAll")}
                </Button>
              )}
            </div>
          </div>
          {geoError && (
            <p role="alert" className="mt-2 text-sm font-medium text-critical">
              {geoError}
            </p>
          )}
        </Container>
      </Band>

      <Container className="py-6">
        <p aria-live="polite" className="meta mb-3">
          {first ? t("results", { count: first.total }) : " "}
        </p>
        {first?.desde_cache && first.frescura_ultima_actualizacion && (
          <p role="status" className="mb-4 border-l-4 border-preventive pl-3 text-sm font-medium">
            {t("cacheNotice", { date: formatDateTime(first.frescura_ultima_actualizacion, locale) })}
          </p>
        )}

        {busqueda.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
        {busqueda.isError && <ErrorNotice error={busqueda.error} referenceLabel={tc("reference")} />}
        {first && items.length === 0 && (
          <StatusBlock kind="empty" title={t("empty")}>
            <p>{t("emptyHint")}</p>
          </StatusBlock>
        )}
      </Container>

      {items.length > 0 && <CatalogRows items={items} label={t("title")} />}

      {busqueda.hasNextPage && (
        <Container className="py-8 text-center">
          <Button variant="secondary" onClick={() => busqueda.fetchNextPage()} loading={busqueda.isFetchingNextPage}>
            {t("loadMore")}
          </Button>
        </Container>
      )}
    </>
  );
}
