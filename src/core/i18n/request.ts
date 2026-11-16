import { getRequestConfig } from "next-intl/server";
import { routing, isLocale } from "./routing";

/** Cada espacio de nombres vive en `messages/{locale}/{ns}.json`. */
export const NAMESPACES = [
  "common",
  "auth",
  "catalogo",
  "reservas",
  "perfil",
  "prestador",
  "admin",
  "analitica",
] as const;

export default getRequestConfig(async ({ requestLocale }) => {
  const requested = await requestLocale;
  const locale = isLocale(requested) ? requested : routing.defaultLocale;

  const entries = await Promise.all(
    NAMESPACES.map(async (ns) => {
      const mod = await import(`../../../messages/${locale}/${ns}.json`);
      return [ns, mod.default] as const;
    }),
  );

  return { locale, messages: Object.fromEntries(entries) };
});
