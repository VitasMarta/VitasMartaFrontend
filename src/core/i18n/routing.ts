import { defineRouting } from "next-intl/routing";

/** RF-11: español (Colombia) por defecto, inglés (EE. UU.) como alternativa. */
export const LOCALES = ["es-CO", "en-US"] as const;
export type Locale = (typeof LOCALES)[number];
export const DEFAULT_LOCALE: Locale = "es-CO";

export const routing = defineRouting({
  locales: LOCALES,
  defaultLocale: DEFAULT_LOCALE,
  localePrefix: "always",
});

export const isLocale = (value: string | undefined | null): value is Locale =>
  !!value && (LOCALES as readonly string[]).includes(value);
