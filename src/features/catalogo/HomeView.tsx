"use client";

import { useLocale, useTranslations } from "next-intl";
import { localized } from "@/core/format";
import { Link } from "@/core/i18n/navigation";
import { useSessionStore } from "@/core/auth/sessionStore";
import { useDocumentTitle } from "@/shared/hooks";
import { Button } from "@/shared/ui/Button";
import { Icon } from "@/shared/ui/Icon";
import { Band, Container } from "@/shared/ui/layout";
import { StatusBlock } from "@/shared/ui/StatusBlock";
import { useBusqueda, useCategorias } from "./api";
import { CatalogRows, RecommendationsBand } from "./components";

/** Portada editorial (IU-01): hero + buscador, banda de IA (M6), categorías y destinos populares. */
export function HomeView() {
  const t = useTranslations("catalogo.home");
  const tc = useTranslations("common");
  const locale = useLocale();
  const status = useSessionStore((s) => s.status);
  const categorias = useCategorias();
  const popular = useBusqueda({ orden: "popularidad" }, 5);
  useDocumentTitle(t("title"));

  return (
    <>
      <Band tone="mist">
        <Container className="grid gap-8 py-14 lg:grid-cols-[3fr_2fr] lg:items-end">
          <div>
            <p className="meta uppercase tracking-wider text-ink/80">Santa Marta · Colombia</p>
            <h1 className="mt-3">{t("title")}</h1>
            <p className="mt-4 max-w-2xl text-lg">{t("subtitle")}</p>
          </div>
          <form action={`/${locale}/buscar`} method="get" role="search" aria-label={t("searchLabel")}>
            <label htmlFor="home-search" className="block text-sm font-semibold">
              {t("searchLabel")}
            </label>
            <div className="mt-2 flex gap-2">
              <input
                id="home-search"
                name="texto"
                type="search"
                placeholder={t("searchPlaceholder")}
                className="min-h-11 w-full border-b-2 border-ink bg-base px-3 py-2 placeholder:text-ink/60"
              />
              <Button type="submit">{tc("search")}</Button>
            </div>
          </form>
        </Container>
      </Band>

      <RecommendationsBand />
      {status === "anonymous" && (
        <Container className="pt-6">
          <p className="inline-flex flex-wrap items-center gap-2 border-l-4 border-emerald pl-3">
            <Icon name="spark" className="text-emerald-ink" />
            {t("loginForAi")}{" "}
            <Link href="/login" className="text-link font-semibold">
              {t("loginLink")}
            </Link>
          </p>
        </Container>
      )}

      <Container className="py-10">
        <h2 className="border-t-2 border-ink pt-4 !text-2xl">{t("categoriesTitle")}</h2>
        <ul role="list" className="mt-4 flex flex-wrap divide-x divide-ink/15 border-y border-ink/15">
          {categorias.data
            ?.filter((c) => c.primer_nivel)
            .map((c) => (
              <li key={c.slug} className="flex-1">
                <Link href={`/buscar?categorias=${c.slug}`} className="flex min-h-14 items-center justify-center px-6 py-3 text-center font-semibold hover:bg-mist">
                  {localized(c.nombre, locale)}
                </Link>
              </li>
            ))}
        </ul>
      </Container>

      <section aria-labelledby="popular-title">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-3 border-t-2 border-ink pt-4">
            <div>
              <h2 id="popular-title" className="!text-2xl">
                {t("popularTitle")}
              </h2>
              <p className="text-ink/80">{t("popularDesc")}</p>
            </div>
            <Link href="/buscar" className="text-link font-semibold">
              {t("viewAll")}
            </Link>
          </div>
        </Container>
        <div className="mt-4">
          {popular.isPending && <Container><StatusBlock kind="loading" title={tc("loading")} /></Container>}
          {popular.data && <CatalogRows items={popular.data.pages[0].items} label={t("popularTitle")} />}
        </div>
      </section>
    </>
  );
}
