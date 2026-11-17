import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative, sep } from "node:path";

export const ROOT = process.cwd();

export function* walk(dir, exts) {
  for (const entry of readdirSync(dir)) {
    if (["node_modules", ".next", ".git"].includes(entry)) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full, exts);
    else if (exts.some((e) => full.endsWith(e))) yield full;
  }
}

export const rel = (file) => relative(ROOT, file).split(sep).join("/");
export const read = (file) => readFileSync(file, "utf8");
