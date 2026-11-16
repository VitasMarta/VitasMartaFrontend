"use client";

import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

/**
 * Gráficas directamente sobre el lienzo de la sección (sin tarjetas), con trazos en Azul Tinta y
 * Esmeralda (guía §2.1). Toda gráfica tiene una tabla equivalente para lectores de pantalla
 * y no depende solo del color (WCAG 1.4.1).
 */
const INK = "var(--color-secondary-ink)";
const EMERALD = "var(--color-tertiary-emerald)";

export function TrendChart({
  data,
  label,
  valueLabel,
  format = (n) => String(n),
}: {
  data: { x: string; y: number }[];
  label: string;
  valueLabel: string;
  format?: (n: number) => string;
}) {
  return (
    <figure className="w-full">
      <figcaption className="meta mb-2 font-semibold">{label}</figcaption>
      <div role="img" aria-label={`${label}: ${data.map((d) => `${d.x} ${format(d.y)}`).join(", ")}`} className="h-64 w-full">
        <ResponsiveContainer width="100%" height="100%" minWidth={200}>
          <LineChart data={data} margin={{ top: 8, right: 16, bottom: 0, left: 0 }} accessibilityLayer={false}>
            <CartesianGrid stroke={INK} strokeOpacity={0.15} vertical={false} />
            <XAxis dataKey="x" stroke={INK} tick={{ fill: INK, fontSize: 12 }} tickLine={false} />
            <YAxis stroke={INK} tick={{ fill: INK, fontSize: 12 }} tickLine={false} width={48} />
            <Tooltip formatter={(v) => format(Number(v))} contentStyle={{ border: `1px solid ${INK}`, borderRadius: 0 }} />
            <Line type="monotone" dataKey="y" name={valueLabel} stroke={EMERALD} strokeWidth={3} dot={{ r: 4, fill: INK, stroke: INK }} isAnimationActive={false} />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <table className="sr-only">
        <caption>{label}</caption>
        <thead>
          <tr>
            <th scope="col">{label}</th>
            <th scope="col">{valueLabel}</th>
          </tr>
        </thead>
        <tbody>
          {data.map((d) => (
            <tr key={d.x}>
              <th scope="row">{d.x}</th>
              <td>{format(d.y)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </figure>
  );
}

/** Ranking en barras horizontales: filas de tabla con barra en línea (el valor siempre va en texto). */
export function RankBars({
  rows,
  caption,
  valueHeader,
  labelHeader,
  format = (n) => String(n),
}: {
  rows: { key: string; label: string; value: number; note?: string | null }[];
  caption: string;
  labelHeader: string;
  valueHeader: string;
  format?: (n: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <table className="w-full border-collapse text-left">
      <caption className="sr-only">{caption}</caption>
      <thead>
        <tr className="bg-mist">
          <th scope="col" className="meta px-3 py-2 text-xs uppercase tracking-wider text-ink/80">{labelHeader}</th>
          <th scope="col" className="meta px-3 py-2 text-xs uppercase tracking-wider text-ink/80">{valueHeader}</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={r.key} className="border-b border-ink/10">
            <th scope="row" className="w-2/5 px-3 py-3 text-left font-medium">
              <span className="tabular mr-2 text-ink/80">{String(i + 1).padStart(2, "0")}</span>
              {r.label}
            </th>
            <td className="px-3 py-3">
              <div className="flex items-center gap-3">
                <span aria-hidden="true" className="block h-3 flex-1 bg-ink/10">
                  <span className="block h-full bg-ink" style={{ width: `${(r.value / max) * 100}%` }} />
                </span>
                <span className="tabular w-24 text-right font-semibold">{format(r.value)}</span>
                {r.note && <span className="meta w-16 text-right text-emerald-ink">{r.note}</span>}
              </div>
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

/** Mapa de calor como tabla: la intensidad se muestra en número (no solo en tono). */
export function Heatmap({
  cells,
  caption,
  rowHeader,
  format = (n) => `${Math.round(n * 100)} %`,
}: {
  cells: { row: string; col: string; value: number }[];
  caption: string;
  rowHeader: string;
  format?: (n: number) => string;
}) {
  const rows = [...new Set(cells.map((c) => c.row))];
  const cols = [...new Set(cells.map((c) => c.col))];
  const at = (r: string, c: string) => cells.find((x) => x.row === r && x.col === c)?.value;
  return (
    <div className="w-full overflow-x-auto">
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="bg-mist">
            <th scope="col" className="meta px-3 py-2 text-xs uppercase tracking-wider text-ink/80">{rowHeader}</th>
            {cols.map((c) => (
              <th key={c} scope="col" className="meta px-3 py-2 text-center text-xs uppercase tracking-wider text-ink/80">{c}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r} className="border-b border-ink/10">
              <th scope="row" className="px-3 py-2 text-left font-medium">{r}</th>
              {cols.map((c) => {
                const v = at(r, c);
                // Texto SIEMPRE en Azul Tinta: el tinte de fondo llega como máximo al 30 % (≥ 7:1) y la
                // intensidad se refuerza con una barra, de modo que ninguna celda cae en un contraste intermedio.
                return (
                  <td
                    key={c}
                    className="tabular px-3 py-2 text-center font-semibold text-ink"
                    style={{ backgroundColor: v == null ? undefined : `color-mix(in srgb, var(--color-secondary-ink) ${Math.round(v * 30)}%, var(--color-surface-base))` }}
                  >
                    {v == null ? "—" : format(v)}
                    {v != null && (
                      <span aria-hidden="true" className="mx-auto mt-1 block h-1.5 w-full max-w-24 bg-ink/15">
                        <span className="block h-full bg-ink" style={{ width: `${Math.round(v * 100)}%` }} />
                      </span>
                    )}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
