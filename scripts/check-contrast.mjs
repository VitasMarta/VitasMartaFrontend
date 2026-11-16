// R2/R4 · Valida los pares texto/fondo de la paleta (WCAG 2.1 AA). Falla si alguno no cumple.
import { readFileSync } from "node:fs";

const css = readFileSync("src/app/globals.css", "utf8");
const token = (name) => {
  const m = new RegExp(`--${name}:\\s*(#[0-9a-fA-F]{6})`).exec(css);
  if (!m) throw new Error(`Token --${name} no definido en globals.css`);
  return m[1];
};

const rgb = (hex) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
const lin = (c) => ((c /= 255) <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const lum = ([r, g, b]) => 0.2126 * lin(r) + 0.7152 * lin(g) + 0.0722 * lin(b);
const blend = (fg, bg, a) => fg.map((c, i) => Math.round(c * a + bg[i] * (1 - a)));
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};

const C = {
  mist: rgb(token("color-primary-mist")),
  ink: rgb(token("color-secondary-ink")),
  emerald: rgb(token("color-tertiary-emerald")),
  emeraldText: rgb(token("color-emerald-text")),
  base: rgb(token("color-surface-base")),
  warn: rgb(token("color-warn")),
  warnText: rgb(token("color-warn-text")),
  crit: rgb(token("color-crit")),
};

// [descripción, primer plano, fondo, mínimo]  (4.5 = texto normal · 3 = texto grande / componentes de UI)
const PAIRS = [
  ["Texto Tinta sobre Base", C.ink, C.base, 4.5],
  ["Texto Tinta sobre Rosa Niebla", C.ink, C.mist, 4.5],
  ["Texto Rosa Niebla sobre Tinta (botón/cabecera)", C.mist, C.ink, 4.5],
  ["Texto Base sobre Tinta", C.base, C.ink, 4.5],
  ["Texto Tinta/80 sobre Rosa Niebla (metadatos)", blend(C.ink, C.mist, 0.8), C.mist, 4.5],
  ["Texto Tinta/80 sobre Base (metadatos)", blend(C.ink, C.base, 0.8), C.base, 4.5],
  ["Texto Esmeralda-texto sobre Base", C.emeraldText, C.base, 4.5],
  ["Texto Esmeralda-texto sobre Rosa Niebla", C.emeraldText, C.mist, 4.5],
  ["Texto Ámbar-texto sobre Base", C.warnText, C.base, 4.5],
  ["Texto Ámbar-texto sobre Rosa Niebla", C.warnText, C.mist, 4.5],
  ["Texto Coral sobre Base", C.crit, C.base, 4.5],
  ["Texto Coral sobre Rosa Niebla", C.crit, C.mist, 4.5],
  ["Texto grande Tinta sobre Esmeralda (botón >=18.66px/700)", C.ink, C.emerald, 3],
  ["Gráfico Esmeralda sobre Base", C.emerald, C.base, 3],
  ["Gráfico Ámbar sobre Base", C.warn, C.base, 3],
  ["Gráfico Ámbar sobre Rosa Niebla", C.warn, C.mist, 3],
  ["Gráfico Coral sobre Rosa Niebla", C.crit, C.mist, 3],
  ["Anillo de foco Tinta sobre Base", C.ink, C.base, 3],
  ["Anillo de foco Tinta sobre Rosa Niebla", C.ink, C.mist, 3],
  ["Anillo de foco Rosa Niebla sobre Tinta (cabecera/pie)", C.mist, C.ink, 3],
];

let failed = 0;
for (const [label, fg, bg, min] of PAIRS) {
  const r = ratio(fg, bg);
  const ok = r >= min;
  if (!ok) failed++;
  console.log(`${ok ? "OK  " : "FAIL"} ${r.toFixed(2).padStart(5)}:1 (min ${min})  ${label}`);
}
console.log(
  `\nInfo · Esmeralda original sobre Rosa Niebla = ${ratio(C.emerald, C.mist).toFixed(2)}:1 → solo decorativo (barra lateral), nunca texto ni foco.`,
);
if (failed) {
  console.error(`\n✖ check:contrast — ${failed} par(es) bajo el mínimo WCAG 2.1 AA`);
  process.exit(1);
}
console.log("\n✔ check:contrast — todos los pares cumplen WCAG 2.1 AA");
