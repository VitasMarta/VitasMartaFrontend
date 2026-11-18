"use client";

import { useEffect, useState, useTransition } from "react";
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
import { Icon, type IconName } from "./Icon";
import { SlideOver } from "./SlideOver";

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

/** Nombre de cada idioma en su propio idioma (no se traduce). */
const AUTONIMO: Record<Locale, string> = { "es-CO": "Español", "en-US": "English" };

/**
 * Selector de idioma en control segmentado. `oscuro` va sobre la banda Azul Tinta de la cabecera;
 * `claro`, dentro del menú móvil (con el nombre completo del idioma).
 */
export function LocaleSwitcher({ tono = "oscuro" }: { tono?: "oscuro" | "claro" }) {
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

  const claro = tono === "claro";
  return (
    <div
      role="group"
      translate="no"
      aria-label={t("label")}
      className={cn("items-center gap-1 rounded-full p-1", claro ? "grid w-full grid-cols-2 bg-page" : "inline-flex bg-on-action/10")}
    >
      {LOCALES.map((l) => {
        const activo = l === locale;
        return (
          <button
            key={l}
            type="button"
            lang={l}
            aria-pressed={activo}
            onClick={() => change(l)}
            className={cn(
              "min-h-9 rounded-full px-3 text-sm font-semibold transition-colors",
              claro
                ? activo ? "bg-card text-ink shadow-sm" : "text-ink/70 hover:text-ink"
                : activo ? "bg-card text-ink" : "text-on-action/80 hover:text-on-action",
            )}
          >
            {claro ? AUTONIMO[l] : <span className="uppercase tracking-wide">{l.slice(0, 2)}</span>}
            <span className="sr-only"> — {t(l)}</span>
          </button>
        );
      })}
    </div>
  );
}

interface NavItem {
  key: string;
  href: string;
  icon: IconName;
  /** `public` = siempre visible; si no, requiere acceso al área. */
  area: Area | "public" | "anon";
}

const NAV: NavItem[] = [
  { key: "explore", href: "/buscar", icon: "search", area: "public" },
  { key: "myReservations", href: "/mis-reservas", icon: "calendar", area: "turista" },
  { key: "myProfile", href: "/mi-perfil", icon: "user", area: "turista" },
  { key: "becomeProvider", href: "/onboarding", icon: "store", area: "onboarding" },
  { key: "myOffer", href: "/mi-oferta", icon: "grid", area: "prestador" },
  { key: "myBusiness", href: "/mi-negocio", icon: "briefcase", area: "prestador" },
  { key: "receivedReservations", href: "/reservas-recibidas", icon: "inbox", area: "prestador" },
  { key: "checkin", href: "/checkin-qr", icon: "qr", area: "prestador" },
  { key: "myIndicators", href: "/mis-indicadores", icon: "chart", area: "prestador" },
  { key: "admin", href: "/admin", icon: "shield", area: "admin" },
  { key: "monitoring", href: "/monitoreo", icon: "activity", area: "monitoreo" },
  { key: "analytics", href: "/analitica", icon: "chart", area: "analitica" },
  { key: "sustainability", href: "/sostenibilidad", icon: "leaf", area: "sostenibilidad" },
];

function Marca() {
  const t = useTranslations("common");
  return (
    <Link href="/" className="group inline-flex items-center gap-2.5 rounded-md py-1">
      <span aria-hidden="true" className="inline-flex size-9 items-center justify-center rounded-xl bg-emerald text-ink transition-transform group-hover:-rotate-6">
        <Icon name="leaf" size={20} />
      </span>
      <span translate="no" className="notranslate text-xl font-bold tracking-tight">VITASMARTA</span>
      <span className="sr-only"> — {t("home")}</span>
    </Link>
  );
}

/** Rol de la sesión con su etiqueta legible (se reutilizan las de administración). */
function useRolLegible() {
  const tr = useTranslations("admin.roles");
  const rol = useSessionStore((s) => s.user?.rol);
  return rol ? (tr.has(rol) ? tr(rol) : rol) : "";
}

export function SiteHeader() {
  const t = useTranslations("common");
  const pathname = usePathname();
  const router = useRouter();
  const queryClient = useQueryClient();
  const status = useSessionStore((s) => s.status);
  const rol = useSessionStore((s) => s.user?.rol);
  const rolLegible = useRolLegible();
  const [menuAbierto, setMenuAbierto] = useState(false);

  const visible = NAV.filter((item) => item.area === "public" || (status === "authenticated" && canAccess(rol, item.area as Area)));
  const isActive = (href: string) => pathname === href || pathname.startsWith(`${href}/`);

  // Al navegar se cierra el menú móvil.
  useEffect(() => setMenuAbierto(false), [pathname]);

  const onLogout = async () => {
    setMenuAbierto(false);
    await logout();
    queryClient.clear();
    router.push("/");
  };

  return (
    <header className="on-ink bg-ink text-on-action">
      {/* Barra superior: marca + idioma + cuenta (escritorio) / botón de menú (móvil). */}
      <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-4 px-4 sm:px-6 lg:px-8">
        <Marca />

        <div className="hidden items-center gap-3 lg:flex">
          <LocaleSwitcher />
          {status === "authenticated" && (
            <>
              <span className="inline-flex items-center gap-2 rounded-full bg-on-action/10 py-1 pl-1 pr-3 text-sm font-semibold">
                <span aria-hidden="true" className="inline-flex size-7 items-center justify-center rounded-full bg-card text-ink">
                  <Icon name="user" size={16} />
                </span>
                <span>
                  <span className="sr-only">{t("nav.signedInAs")} </span>
                  {rolLegible}
                </span>
              </span>
              <button
                type="button"
                onClick={onLogout}
                className="inline-flex min-h-9 items-center gap-2 rounded-full px-3 text-sm font-semibold text-on-action/85 transition-colors hover:bg-on-action/10 hover:text-on-action"
              >
                <Icon name="logout" size={16} />
                {t("nav.logout")}
              </button>
            </>
          )}
          {status === "anonymous" && (
            <>
              <Link href="/login" className="inline-flex min-h-9 items-center rounded-full px-4 text-sm font-semibold hover:bg-on-action/10">
                {t("nav.login")}
              </Link>
              <Link href="/registro" className="inline-flex min-h-9 items-center rounded-full bg-card px-4 text-sm font-semibold text-ink transition-colors hover:bg-mist">
                {t("nav.register")}
              </Link>
            </>
          )}
        </div>

        <button
          type="button"
          onClick={() => setMenuAbierto(true)}
          aria-expanded={menuAbierto}
          aria-haspopup="dialog"
          className="inline-flex min-h-11 items-center gap-2 rounded-full bg-on-action/10 pl-3 pr-4 text-sm font-semibold transition-colors hover:bg-on-action/20 lg:hidden"
        >
          <Icon name="menu" size={20} />
          {t("nav.menu")}
        </button>
      </div>

      {/* Navegación por áreas (escritorio): íconos + subrayado esmeralda en la activa. */}
      <nav aria-label={t("nav.label")} className="hidden border-t border-on-action/10 lg:block">
        <ul role="list" className="mx-auto flex max-w-7xl gap-1 overflow-x-auto px-4 sm:px-6 lg:px-8">
          {visible.map((item) => {
            const activo = isActive(item.href);
            return (
              <li key={item.key} className="shrink-0">
                <Link
                  href={item.href}
                  aria-current={activo ? "page" : undefined}
                  className={cn(
                    "relative inline-flex h-12 items-center gap-2 rounded-t-md px-3 text-sm font-semibold transition-colors",
                    "after:absolute after:inset-x-3 after:bottom-0 after:h-[3px] after:rounded-full after:transition-colors",
                    activo ? "text-on-action after:bg-emerald" : "text-on-action/70 after:bg-transparent hover:bg-on-action/5 hover:text-on-action",
                  )}
                >
                  <Icon name={item.icon} size={17} />
                  {t(`nav.${item.key}`)}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Menú móvil: panel lateral accesible (foco atrapado, Esc, fondo que cierra). */}
      <SlideOver open={menuAbierto} onClose={() => setMenuAbierto(false)} title={t("nav.menu")}>
        <div className="flex flex-1 flex-col gap-6">
          {status === "authenticated" && (
            <p className="flex items-center gap-3 rounded-xl bg-page p-3">
              <span aria-hidden="true" className="inline-flex size-10 items-center justify-center rounded-full bg-ink text-on-action">
                <Icon name="user" size={20} />
              </span>
              <span className="leading-tight">
                <span className="meta block text-ink/70">{t("nav.signedInAs")}</span>
                <span className="font-semibold">{rolLegible}</span>
              </span>
            </p>
          )}

          <nav aria-label={t("nav.label")}>
            <ul role="list" className="space-y-1">
              {visible.map((item) => {
                const activo = isActive(item.href);
                return (
                  <li key={item.key}>
                    <Link
                      href={item.href}
                      aria-current={activo ? "page" : undefined}
                      onClick={() => setMenuAbierto(false)}
                      className={cn(
                        "flex min-h-12 items-center gap-3 rounded-xl px-3 font-semibold transition-colors",
                        activo ? "bg-ink text-on-action" : "text-ink hover:bg-page",
                      )}
                    >
                      <span
                        aria-hidden="true"
                        className={cn("inline-flex size-9 items-center justify-center rounded-lg", activo ? "bg-on-action/15" : "bg-page text-ink")}
                      >
                        <Icon name={item.icon} size={18} />
                      </span>
                      <span className="flex-1">{t(`nav.${item.key}`)}</span>
                      <Icon name="chevron" size={16} className={activo ? "opacity-80" : "opacity-40"} />
                    </Link>
                  </li>
                );
              })}
            </ul>
          </nav>

          <div>
            <p className="meta mb-2 font-semibold text-ink/70">{t("locale.label")}</p>
            <LocaleSwitcher tono="claro" />
          </div>

          <div className="mt-auto space-y-2 border-t border-line pt-4">
            {status === "authenticated" && (
              <button
                type="button"
                onClick={onLogout}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-line font-semibold text-critical transition-colors hover:bg-page"
              >
                <Icon name="logout" size={18} />
                {t("nav.logout")}
              </button>
            )}
            {status === "anonymous" && (
              <div className="grid grid-cols-2 gap-2">
                <Link href="/login" onClick={() => setMenuAbierto(false)} className="flex min-h-12 items-center justify-center rounded-xl border border-line font-semibold text-ink hover:bg-page">
                  {t("nav.login")}
                </Link>
                <Link href="/registro" onClick={() => setMenuAbierto(false)} className="flex min-h-12 items-center justify-center rounded-xl bg-action font-semibold text-on-action hover:bg-action-strong">
                  {t("nav.register")}
                </Link>
              </div>
            )}
          </div>
        </div>
      </SlideOver>
    </header>
  );
}

export function SiteFooter() {
  const t = useTranslations("common.footer");
  return (
    <footer className="on-ink mt-16 bg-ink text-on-action">
      <div className="mx-auto grid max-w-7xl gap-6 px-4 py-10 sm:px-6 md:grid-cols-[2fr_1fr] lg:px-8">
        <div>
          <p className="text-lg font-bold">VITASMARTA</p>
          <p className="mt-1 max-w-xl text-sm">{t("tagline")}</p>
        </div>
        <p className="text-sm md:text-right">{t("data")}</p>
      </div>
      <p className="border-t border-on-action/30 px-4 py-4 text-center text-sm">{t("rights", { year: new Date().getFullYear() })}</p>
    </footer>
  );
}
