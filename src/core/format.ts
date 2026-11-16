import type { Localized } from "@/core/api/types";

const TZ = "America/Bogota";

/** Elige el texto del idioma activo en `{ "es-CO": "...", "en-US": "..." }` o `{ es, en }`. */
export function localized(value: Localized | null | undefined, locale: string): string {
  if (value == null) return "";
  if (typeof value === "string") return value;
  const short = locale.slice(0, 2);
  return value[locale] ?? value[short] ?? value["es-CO"] ?? value.es ?? Object.values(value)[0] ?? "";
}

export const formatCOP = (amount: number, locale: string): string =>
  new Intl.NumberFormat(locale, { style: "currency", currency: "COP", maximumFractionDigits: 0 }).format(amount);

export const formatPercent = (value: number, locale: string, digits = 0): string =>
  `${new Intl.NumberFormat(locale, { maximumFractionDigits: digits, minimumFractionDigits: digits }).format(value)} %`;

export const formatNumber = (value: number, locale: string): string => new Intl.NumberFormat(locale).format(value);

export const formatDate = (iso: string | undefined | null, locale: string): string => {
  if (!iso) return "";
  const d = new Date(iso.length === 10 ? `${iso}T00:00:00` : iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { dateStyle: "long", timeZone: iso.length === 10 ? undefined : TZ }).format(d);
};

export const formatDateTime = (iso: string | undefined | null, locale: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { dateStyle: "medium", timeStyle: "short", timeZone: TZ }).format(d);
};

export const formatBytes = (bytes: number): string =>
  bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

/** Monto en COP desde `number | {monto}`. */
export const amountOf = (v: number | { monto: number } | null | undefined): number | null =>
  v == null ? null : typeof v === "number" ? v : v.monto;
