// R1 · CERO CARDS. Falla si encuentra patrones de tarjeta en src/.
import { ROOT, read, rel, walk } from "./walk.mjs";
import { join } from "node:path";

const RULES = [
  { re: /\bshadow(-[a-z0-9\[\]\/.]+)?\b/, why: "sombra (shadow-*) → patrón de tarjeta" },
  { re: /box-shadow\s*:/i, why: "box-shadow en CSS" },
  { re: /drop-shadow/, why: "drop-shadow" },
  { re: /<\s*[A-Za-z]*Card\b|\bclass(Name)?\s*=\s*["'`{][^"'`]*\bcard\b/i, why: "componente/clase Card" },
  { re: /\bexport\s+(default\s+)?(function|const|class)\s+\w*Card\b/, why: "definición de un componente *Card" },
];

// className con borde perimetral cerrado + esquinas redondeadas = caja flotante tipo tarjeta.
const BOXED = (line) =>
  /\bborder(-\d+)?(?![-\w])/.test(line) && /\brounded(-(md|lg|xl|2xl|3xl))?(?![-\w])/.test(line);

const problems = [];
for (const file of walk(join(ROOT, "src"), [".ts", ".tsx", ".css"])) {
  read(file).split("\n").forEach((line, i) => {
    if (line.includes("check-no-cards:allow")) return;
    for (const { re, why } of RULES) if (re.test(line)) problems.push(`${rel(file)}:${i + 1}  ${why}\n    ${line.trim()}`);
    if (BOXED(line)) problems.push(`${rel(file)}:${i + 1}  borde cerrado + rounded (caja flotante)\n    ${line.trim()}`);
  });
}

if (problems.length) {
  console.error(`✖ check:no-cards — ${problems.length} hallazgo(s)\n` + problems.join("\n"));
  process.exit(1);
}
console.log("✔ check:no-cards — sin patrones de tarjeta");
