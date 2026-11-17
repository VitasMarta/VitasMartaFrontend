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

/** Hora local de Santa Marta (HH:mm) de un instante ISO. */
export const formatTime = (iso: string | undefined | null, locale: string): string => {
  if (!iso) return "";
  const d = new Date(iso);
  return Number.isNaN(d.getTime())
    ? iso
    : new Intl.DateTimeFormat(locale, { hour: "2-digit", minute: "2-digit", hourCycle: "h23", timeZone: TZ }).format(d);
};

/** Día calendario en Santa Marta (`YYYY-MM-DD`) de un instante ISO: agrupa franjas por fecha local. */
export const localDayOf = (iso: string): string => {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso.slice(0, 10);
  return new Intl.DateTimeFormat("en-CA", { year: "numeric", month: "2-digit", day: "2-digit", timeZone: TZ }).format(d);
};

/** Rango de los últimos `n` meses (incluido el actual) como `YYYY-MM`: M9 lo exige para series de tendencia. */
export function rangoMensual(n = 6): { desde: string; hasta: string } {
  const d = new Date();
  const hasta = d.toISOString().slice(0, 7);
  d.setUTCDate(1);
  d.setUTCMonth(d.getUTCMonth() - (n - 1));
  return { desde: d.toISOString().slice(0, 7), hasta };
}

/** Rango de fechas (`YYYY-MM-DD`) de los últimos `dias` días: M8 exige `desde` y `hasta` en el histórico. */
export function rangoDias(dias = 180): { desde: string; hasta: string } {
  const hasta = new Date();
  const desde = new Date(hasta.getTime() - dias * 86_400_000);
  return { desde: desde.toISOString().slice(0, 10), hasta: hasta.toISOString().slice(0, 10) };
}

export const formatBytes = (bytes: number): string =>
  bytes > 1e6 ? `${(bytes / 1e6).toFixed(1)} MB` : `${Math.max(1, Math.round(bytes / 1e3))} KB`;

/** Monto en COP desde `number | {monto}`. */
export const amountOf = (v: number | { monto: number } | null | undefined): number | null =>
  v == null ? null : typeof v === "number" ? v : v.monto;
