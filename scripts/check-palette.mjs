// R2 · Prohíbe colores hexadecimales sueltos fuera de globals.css (todo va por tokens).
import { ROOT, read, rel, walk } from "./walk.mjs";
import { join } from "node:path";

const problems = [];
for (const file of walk(join(ROOT, "src"), [".ts", ".tsx", ".css"])) {
  const f = rel(file);
  if (f === "src/app/globals.css" || f.startsWith("src/mocks/") || /\.test\.tsx?$/.test(f)) continue;
  read(file)
    .split("\n")
    .forEach((line, i) => {
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      if (/#[0-9a-fA-F]{6}\b|#[0-9a-fA-F]{3}\b(?![\w-])/.test(line))
        problems.push(`${f}:${i + 1}  color hex suelto\n    ${line.trim()}`);
    });
}
if (problems.length) {
  console.error(`✖ check:palette — ${problems.length} hallazgo(s)\n` + problems.join("\n"));
  process.exit(1);
}
console.log("✔ check:palette — solo tokens de la paleta oficial");
