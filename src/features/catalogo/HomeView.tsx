"use client";

import { useLocale, useTranslations } from "next-intl";
import { localized } from "@/core/format";
import { Link } from "@/core/i18n/navigation";
import { useSessionStore } from "@/core/auth/sessionStore";
import { useDocumentTitle } from "@/shared/hooks";
import { Icon } from "@/shared/ui/Icon";
import { Container } from "@/shared/ui/layout";
import { StatusBlock } from "@/shared/ui/StatusBlock";
import { useBusqueda, useCategorias } from "./api";
import { DestinoGrid } from "./cards";
import { RecommendationsBand } from "./components";
import { SearchBar } from "./SearchBar";

/** Portada: banda de marca con el buscador destacado, recomendaciones IA (M6), categorías y destinos (M2). */
export function HomeView() {
  const t = useTranslations("catalogo.home");
  const tl = useTranslations("catalogo.layout");
  const tc = useTranslations("common");
  const locale = useLocale();
  const status = useSessionStore((s) => s.status);
  const categorias = useCategorias();
  const popular = useBusqueda({ orden: "popularidad" }, 8);
  useDocumentTitle(t("title"));

  return (
    <>
      {/* Continúa el color de la cabecera; el buscador se monta sobre el borde inferior de la banda. */}
      <section className="on-ink bg-ink pb-16 text-on-action">
        <Container className="pt-10">
          <p className="meta uppercase tracking-wider">{tl("heroKicker")}</p>
          <h1 className="mt-2 max-w-4xl !text-on-action">{t("title")}</h1>
          <p className="mt-3 max-w-3xl text-lg">{t("subtitle")}</p>
        </Container>
      </section>
      <Container className="-mt-10">
        <SearchBar />
      </Container>

      {status === "anonymous" && (
        <Container className="pt-6">
          <p className="card inline-flex flex-wrap items-center gap-2 px-4 py-3">
            <Icon name="spark" className="text-emerald-ink" />
            {t("loginForAi")}{" "}
            <Link href="/login" className="text-link font-semibold">
              {t("loginLink")}
            </Link>
          </p>
        </Container>
      )}

      <RecommendationsBand />

      <Container className="pt-10">
        <h2 className="!text-2xl">{t("categoriesTitle")}</h2>
        <ul role="list" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          {categorias.data
            ?.filter((c) => c.primer_nivel)
            .map((c) => (
              <li key={c.slug}>
                <Link href={`/buscar?categorias=${c.slug}`} className="card card-hover flex min-h-16 items-center justify-center gap-2 px-4 py-3 text-center font-semibold">
                  <Icon name="leaf" className="text-emerald-ink" />
                  {localized(c.nombre, locale)}
                </Link>
              </li>
            ))}
        </ul>
      </Container>

      <section aria-labelledby="popular-title" className="pt-10">
        <Container>
          <div className="flex flex-wrap items-end justify-between gap-3">
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
          <div className="mt-4">
            {popular.isPending && <StatusBlock kind="loading" title={tc("loading")} />}
            {popular.data && <DestinoGrid items={popular.data.pages[0].items} label={t("popularTitle")} />}
          </div>
        </Container>
      </section>
    </>
  );
}
