import { api } from "@/core/api/gatewayClient";
import { routes } from "@/core/api/routes";
import type { Locale } from "@/core/i18n/routing";

export interface Preferencias {
  idioma_preferido: Locale;
  canal_autorizado?: string | boolean;
  idioma_autorizado?: string | boolean;
  [campo: string]: unknown;
}

export const fetchPreferencias = async (): Promise<Preferencias> =>
  (await api.get<Preferencias>(routes.identidad.preferencias)).data;

/** Persiste el idioma elegido en M7, conservando el resto de preferencias del titular. */
export async function savePreferredLocale(locale: Locale): Promise<void> {
  const current = await fetchPreferencias().catch(() => ({}) as Partial<Preferencias>);
  await api.put(routes.identidad.preferencias, { body: { ...current, idioma_preferido: locale } });
}
