"use client";

import { useTranslations } from "next-intl";
import { Icon } from "@/shared/ui/Icon";
import { Container } from "@/shared/ui/layout";

/** Enlace de descarga de la app móvil de VITASMARTA. */
export const APP_DESCARGA_URL = "https://vitasmartapp.s.gy/Df1RTY";

/** Teléfono dibujado con CSS (decorativo): una miniatura de la app con un destino y su ocupación. */
function TelefonoMaqueta() {
  const t = useTranslations("catalogo.app");
  return (
    <div aria-hidden="true" className="relative mx-auto w-48 rotate-3 sm:w-56">
      <div className="rounded-[2.2rem] border-[6px] border-white/90 bg-page p-2 shadow-2xl shadow-black/40">
        <div className="mx-auto mb-2 h-1.5 w-14 rounded-full bg-ink/20" />
        <div className="space-y-2 px-1 pb-2">
          <p className="text-[0.7rem] font-semibold text-ink/70">{t("mockGreeting")}</p>
          <div className="overflow-hidden rounded-xl bg-white shadow">
            <div className="h-20 bg-gradient-to-br from-emerald to-ink" />
            <div className="space-y-1 p-2">
              <p className="text-[0.75rem] font-bold leading-tight text-ink">{t("mockPlace")}</p>
              <p className="flex items-center gap-1 text-[0.65rem] font-semibold text-emerald-ink">
                <Icon name="leaf" size={10} />
                {t("mockStatus")}
              </p>
              <span className="block h-1 w-full overflow-hidden rounded-full bg-ink/10">
                <span className="block h-full w-1/3 rounded-full bg-emerald" />
              </span>
              <span className="mt-1 block rounded-md bg-action py-1 text-center text-[0.65rem] font-semibold text-on-action">{t("mockBook")}</span>
            </div>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="h-14 rounded-lg bg-gradient-to-br from-ink/80 to-emerald-ink/80" />
            <div className="h-14 rounded-lg bg-gradient-to-br from-action/70 to-ink/80" />
          </div>
        </div>
      </div>
    </div>
  );
}

/** Banda llamativa para descargar la app móvil (portada). */
export function DescargarApp() {
  const t = useTranslations("catalogo.app");
  return (
    <section aria-labelledby="app-title" className="pt-14">
      <Container>
        <div className="on-ink relative overflow-hidden rounded-2xl bg-gradient-to-br from-ink via-ink to-emerald-ink px-6 py-10 text-on-action sm:px-10 lg:py-12">
          {/* Luces decorativas */}
          <span aria-hidden="true" className="pointer-events-none absolute -right-16 -top-20 size-72 rounded-full bg-emerald/30 blur-3xl" />
          <span aria-hidden="true" className="pointer-events-none absolute -bottom-24 left-1/3 size-72 rounded-full bg-action/30 blur-3xl" />

          <div className="relative grid items-center gap-10 lg:grid-cols-[1fr_auto]">
            <div className="max-w-xl">
              <p className="meta inline-flex items-center gap-2 rounded-full bg-white/15 px-3 py-1 font-semibold uppercase tracking-wider">
                <Icon name="phone" size={14} />
                {t("kicker")}
              </p>
              <h2 id="app-title" className="mt-4 !text-3xl !text-on-action sm:!text-4xl">
                {t("title")}
              </h2>
              <p className="mt-3 text-lg text-on-action/90">{t("body")}</p>
              <ul role="list" className="mt-5 space-y-2">
                {(["f1", "f2", "f3"] as const).map((k) => (
                  <li key={k} className="flex items-center gap-3">
                    <span className="inline-flex size-7 shrink-0 items-center justify-center rounded-full bg-emerald text-on-action">
                      <Icon name="check" size={16} />
                    </span>
                    {t(k)}
                  </li>
                ))}
              </ul>
              <a
                href={APP_DESCARGA_URL}
                target="_blank"
                rel="noopener noreferrer"
                aria-describedby="app-cta-hint"
                className="mt-7 inline-flex min-h-14 items-center gap-3 rounded-xl bg-white px-7 text-lg font-bold text-ink shadow-lg shadow-black/25 transition hover:-translate-y-0.5 hover:bg-white/90 hover:shadow-xl focus-visible:outline focus-visible:outline-4 focus-visible:outline-offset-2 focus-visible:outline-white"
              >
                <Icon name="download" size={22} />
                {t("cta")}
              </a>
              <p id="app-cta-hint" className="sr-only">{t("ctaHint")}</p>
            </div>
            <TelefonoMaqueta />
          </div>
        </div>
      </Container>
    </section>
  );
}
