// R5/R6 · Toda petición sale por el cliente del Gateway/BFF y bajo /api/v1/.
import { ROOT, read, rel, walk } from "./walk.mjs";
import { join } from "node:path";

const ALLOWED_NETWORK = ["src/core/config/", "src/core/api/", "src/app/bff/", "src/mocks/", "src/instrumentation.ts"];
const isAllowed = (f) => ALLOWED_NETWORK.some((p) => f.startsWith(p));

const problems = [];
for (const file of walk(join(ROOT, "src"), [".ts", ".tsx"])) {
  const f = rel(file);
  if (f.endsWith(".test.ts") || f.endsWith(".test.tsx")) continue;
  const lines = read(file).split("\n");
  lines.forEach((line, i) => {
    const at = (why) => problems.push(`${f}:${i + 1}  ${why}\n    ${line.trim()}`);
    if (!isAllowed(f)) {
      if (/(?<![\w.])fetch\s*\(|axios|XMLHttpRequest|\bky\b\s*[.(]/.test(line)) at("petición HTTP fuera de core/api (R5)");
      if (/https?:\/\/(localhost|127\.0\.0\.1|[\w.-]+\.vitasmarta\.co)/.test(line)) at("host/URL de backend fija (usa el Gateway vía BFF)");
    }
    // R6: rutas /v1/... sin prefijo /api (M4 internas) o hosts de M2–M10.
    // Excepción: `m4("/v1/...")` en routes.ts es el único punto que reescribe rutas internas de M4.
    // También en src/mocks: el campo `instance` de los errores RFC 7807 de M4 es su ruta INTERNA (`/v1/...`).
    const isM4Mapping = /\bm4\(/.test(line) || /^\s*(\/\/|\*)/.test(line) || f.startsWith("src/mocks/");
    if (!isM4Mapping && /["'`]\/v1\//.test(line)) at("ruta '/v1/...' sin prefijo '/api/v1/' (R6)");
    if (/svc-(catalogo|reservas|prestadores|integracion|ia|identidad|ambiental|reportes|notificaciones)/.test(line) && !f.startsWith("src/mocks/"))
      at("referencia directa a un microservicio interno (R5)");
  });
}

if (problems.length) {
  console.error(`✖ check:gateway-only — ${problems.length} hallazgo(s)\n` + problems.join("\n"));
  process.exit(1);
}
console.log("✔ check:gateway-only — todo el tráfico va al Gateway");
