import { GATEWAY_URL } from "@/core/config/gateway";

/** URL completa de una ruta del Gateway simulado. */
export const gw = (path: string) => `${GATEWAY_URL}/api/v1${path}`;

export const correlationOf = (request: Request) => request.headers.get("x-correlation-id") ?? crypto.randomUUID();

/** Envoltura de error estándar VITASMARTA (CTR-M1-OUT-06). */
export const errorBody = (
  request: Request,
  codigo: string,
  mensaje: string,
  detalles?: { campo: string; problema: string }[],
) => ({
  codigo,
  mensaje,
  marca_temporal: new Date().toISOString(),
  correlation_id: correlationOf(request),
  ...(detalles ? { detalles } : {}),
});

/** RFC 7807 (M4). */
export const problemBody = (status: number, code: string, title: string, detail: string, instance: string) => ({
  type: `https://api.vitasmarta.co/errors/${code.replace(/_/g, "-")}`,
  title,
  status,
  detail,
  instance,
  code,
  trace_id: crypto.randomUUID().replace(/-/g, "").slice(0, 16),
});

export interface MockClaims {
  sub: string;
  rol: string;
  prestador_ref?: string;
}

/** Lee los claims del JWT simulado (el Gateway real los valida con ES256). */
export function claimsOf(request: Request): MockClaims | null {
  const auth = request.headers.get("authorization");
  if (!auth?.startsWith("Bearer ")) return null;
  try {
    const payload = JSON.parse(Buffer.from(auth.slice(7).split(".")[1], "base64url").toString());
    return { sub: payload.sub, rol: payload.rol, prestador_ref: payload.prestador_ref };
  } catch {
    return null;
  }
}

export const unauthorized = (request: Request) =>
  Response.json(errorBody(request, "TOKEN_INVALIDO", "La sesión no es válida o expiró"), { status: 401 });

export const forbidden = (request: Request) =>
  Response.json(errorBody(request, "ACCESO_DENEGADO", "No tienes permiso para realizar esta acción"), { status: 403 });

export const pageOf = <T>(all: T[], url: URL, base: 0 | 1 = 0) => {
  const size = Number(url.searchParams.get("size") ?? url.searchParams.get("page_size") ?? 20);
  const page = Number(url.searchParams.get("page") ?? base);
  const start = (page - base) * size;
  return { slice: all.slice(start, start + size), page, size, total: all.length };
};

/** PDF mínimo válido de una página (comprobantes, exportaciones de datos). */
export function tinyPdf(text: string): Uint8Array {
  const safe = text.replace(/[()\\]/g, "");
  const stream = `BT /F1 14 Tf 72 720 Td (${safe}) Tj ET`;
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets: number[] = [];
  objects.forEach((o, i) => {
    offsets.push(body.length);
    body += `${i + 1} 0 obj\n${o}\nendobj\n`;
  });
  const xref = body.length;
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  body += `trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return new TextEncoder().encode(body);
}

export const isoDay = (offsetDays = 0) => {
  const d = new Date();
  d.setDate(d.getDate() + offsetDays);
  return d.toISOString().slice(0, 10);
};
