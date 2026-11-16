import type { Locale } from "@/core/i18n/routing";

/**
 * Idioma activo para la cabecera `Accept-Language` (RF-11). Lo sincroniza el provider cliente
 * con el locale de la URL; así el cliente HTTP no depende de React.
 */
let current: Locale = "es-CO";
export const setApiLocale = (locale: Locale) => {
  current = locale;
};
export const getApiLocale = (): Locale => current;
