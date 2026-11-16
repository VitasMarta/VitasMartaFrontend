"use client";

import { useTransition } from "react";
import { useLocale, useTranslations } from "next-intl";
import { useQueryClient } from "@tanstack/react-query";
import { Link, usePathname, useRouter } from "@/core/i18n/navigation";
import { LOCALES, type Locale } from "@/core/i18n/routing";
import { setApiLocale } from "@/core/api/locale";
import { savePreferredLocale } from "@/core/auth/preferences";
import { logout } from "@/core/auth/session";
import { canAccess, type Area } from "@/core/auth/rbacGuard";
import { useSessionStore } from "@/core/auth/sessionStore";
import { useUiStore } from "@/core/store/uiStore";
import { cn } from "./cn";
import { ButtonLink } from "./Button";

/** Enlace "Saltar al contenido principal": primer elemento del DOM (RNF-07-2). */
export function SkipLink() {
  const t = useTranslations("common");
  return (
    <a href="#contenido-principal" className="skip-link">
      {t("skip")}
    </a>
  );
}

const UPDATED: Record<Locale, string> = {
  "es-CO": "El idioma de la interfaz fue actualizado",
  "en-US": "The interface language was updated",
};

export function LocaleSwitcher() {
  const t = useTranslations("common.locale");
  const locale = useLocale() as Locale;
  const pathname = usePathname();
  const router = useRouter();
  const [, startTransition] = useTransition();

  const change = (next: Locale) => {
    if (next === locale) return;
    setApiLocale(next);
    const search = typeof window !== "undefined" ? window.location.search : "";
    startTransition(() => router.replace(`${pathname}${search}`, { locale: next }));
    if (useSessionStore.getState().status === "authenticated") {
      savePreferredLocale(next)
        .then(() => useUiStore.getState().push({ tone: "success", message: UPDATED[next] }))
        .catch(() => undefined);
    }
  };

  return (
    <div role="group" aria-label={t("label")} className="flex items-center gap-1">
      {LOCALES.map((l) => (
        <button
          key={l}
          type="button"
          lang={l}
          aria-pressed={l === locale}
          onClick={() => change(l)}
          className={cn(
            "min-h-11 min-w-11 px-2 text-sm font-semibold uppercase tracking-wide hover:bg-mist/20",
            l === locale ? "bg-mist text-ink hover:bg-mist" : "text-mist",
          )}
        >
          {l.slice(0, 2)}
          <span className="sr-only"> — {t(l)}</span>
        </button>
      ))}
    </div>
  );
}

interface NavItem {
  key: string;
  href: string;
  /** `public` = siempre visible; si no, requiere acceso al área. */
  area: Area | "public" | "anon";
}

const NAV: NavItem[] = [
  { key: "explore", href: "/buscar", area: "public" },
  { key: "myReservations", href: "/mis-reservas", area: "turista" },
  { key: "myProfile", href: "/mi-perfil", area: "turista" },
  { key: "becomeProvider", href: "/onboarding", area: "onboarding" },
  { key: "myOffer", href: "/mi-oferta", area: "prestador" },
  { key: "myBusiness", href: "/mi-negocio", area: "prestador" },
  { key: "receivedReservations", href: "/reservas-recibidas", area: "prestador" },
  { key: "checkin", href: "/checkin-qr", area: "prestador" },
  { key: "myIndicators", href: "/mis-indicadores", area: "prestador" },
  { key: "admin", href: "/admin", area: "admin" },
  { key: "monitoring", href: "/monitoreo", area: "monitoreo" },
  { key: "analytics", href: "/analitica", area: "analitica" },
  { key: "sustainability", href: "/sostenibilidad", area: "sostenibilidad" },
];

export function SiteHeader() {
  const t = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useSessionStore((s) => s.status);
  const rol = useSessionStore((s) => s.user?.rol);

  const visible = NAV.filter((item) => item.area === "public" || (status === "authenticated" && canAccess(rol, item.area as Area)));
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  const onLogout = async () => {
    await logout();
    queryClient.clear();
    router.push("/");
  };

  return (
    <header className="on-ink bg-ink text-mist">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-2 px-4 py-2 sm:px-6 lg:px-8">
        <Link href="/" className="py-2 text-xl font-bold tracking-tight">
          VITASMARTA
          <span className="sr-only"> — {t("home")}</span>
        </Link>

        <nav aria-label={t("nav.label")} className="order-last w-full lg:order-none lg:w-auto">
          <ul role="list" className="flex flex-wrap gap-x-1">
            {visible.map((item) => (
              <li key={item.key}>
                <Link
                  href={item.href}
                  aria-current={isActive(item.href) ? "page" : undefined}
                  className={cn(
                    "inline-flex min-h-11 items-center px-3 text-sm font-semibold hover:bg-mist/20",
                    isActive(item.href) && "underline decoration-2 underline-offset-8",
                  )}
                >
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div className="flex items-center gap-2">
          <LocaleSwitcher />
          {status === "authenticated" && (
            <button
              type="button"
              onClick={onLogout}
              className="min-h-11 border-2 border-mist px-4 text-sm font-semibold hover:bg-mist hover:text-ink"
            >
              {t("nav.logout")}
            </button>
          )}
          {status === "anonymous" && (
            <>
              <Link href="/login" className="inline-flex min-h-11 items-center px-3 text-sm font-semibold hover:bg-mist/20">
                {t("nav.login")}
              </Link>
              <ButtonLink href="/registro" variant="secondary" className="!border-mist !text-mist hover:!bg-mist hover:!text-ink !py-1.5 text-sm">
                {t("nav.register")}
              </ButtonLink>
            </>
          )}
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  const t = useTranslations("common.footer");
  return (
    <footer className="on-ink mt-16 bg-ink text-mist">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr] lg:px-8">
        <div>
          <p className="text-lg font-bold">VITASMARTA</p>
          <p className="mt-1 max-w-xl text-sm">{t("tagline")}</p>
        </div>
        <p className="text-sm md:text-right">{t("data")}</p>
      </div>
      <p className="border-t border-mist/30 px-4 py-4 text-center text-sm">{t("rights", { year: new Date().getFullYear() })}</p>
    </footer>
  );
}
