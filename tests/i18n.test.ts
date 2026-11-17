// @vitest-environment node
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { NAMESPACES } from "@/core/i18n/request";

const ROOT = process.cwd();
const load = (locale: string, ns: string) => JSON.parse(readFileSync(join(ROOT, "messages", locale, `${ns}.json`), "utf8"));

function flatten(obj: unknown, prefix = ""): string[] {
  if (obj && typeof obj === "object") return Object.entries(obj).flatMap(([k, v]) => flatten(v, prefix ? `${prefix}.${k}` : k));
  return [prefix];
}
function* walk(dir: string): Generator<string> {
  for (const e of readdirSync(dir)) {
    const p = join(dir, e);
    if (statSync(p).isDirectory()) yield* walk(p);
    else if (/\.tsx?$/.test(p) && !/\.test\./.test(p)) yield p;
  }
}

describe("i18n (RF-11)", () => {
  it.each(NAMESPACES)("«%s» tiene exactamente las mismas claves en es-CO y en-US y ninguna vacía", (ns) => {
    const es = flatten(load("es-CO", ns)).sort();
    const en = flatten(load("en-US", ns)).sort();
    expect(en).toEqual(es);
    for (const locale of ["es-CO", "en-US"]) {
      const json = JSON.stringify(load(locale, ns));
      expect(json).not.toMatch(/:\s*""/);
    }
  });

  it("toda clave literal usada con useTranslations() existe en los mensajes", () => {
    const keys = new Map<string, Set<string>>();
    for (const ns of NAMESPACES) keys.set(ns, new Set(flatten(load("es-CO", ns))));

    const missing: string[] = [];
    let checked = 0;
    for (const file of walk(join(ROOT, "src"))) {
      const src = readFileSync(file, "utf8");
      // Un mismo archivo puede tener varios componentes, cada uno con su propio `t`: cada uso se asocia
      // con la última declaración del mismo nombre que lo precede (ámbito aproximado por posición).
      const decls = [...src.matchAll(/const\s+(\w+)\s*=\s*useTranslations\(\s*"([^"]+)"\s*\)/g)].map((m) => ({ name: m[1], namespace: m[2], index: m.index ?? 0 }));
      for (const name of new Set(decls.map((d) => d.name))) {
        const re = new RegExp(`(?<![\\w.])${name}\\(\\s*"([^"$]+)"`, "g");
        for (const m of src.matchAll(re)) {
          const decl = [...decls].filter((d) => d.name === name && d.index <= (m.index ?? 0)).pop();
          if (!decl) continue;
          const [root, ...rest] = decl.namespace.split(".");
          const set = keys.get(root);
          if (!set) {
            missing.push(`${file}: espacio «${root}» inexistente`);
            continue;
          }
          checked++;
          const full = rest.length ? `${rest.join(".")}.${m[1]}` : m[1];
          if (!(set.has(full) || [...set].some((k) => k.startsWith(`${full}.`)))) missing.push(`${file.replace(ROOT, "")}: ${decl.namespace}.${m[1]}`);
        }
      }
    }
    expect(checked).toBeGreaterThan(300); // garantiza que el verificador realmente inspecciona el código
    expect(missing).toEqual([]);
  });
});
