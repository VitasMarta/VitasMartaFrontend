import { ApiError, networkError, normalizeError } from "./errorNormalizer";
import { getApiLocale } from "./locale";

/** El navegador solo habla con el BFF del mismo origen; el BFF reenvía al API Gateway (M1). */
export const BFF_BASE = "/bff";

type QueryValue = string | number | boolean | null | undefined | ReadonlyArray<string | number>;
export type Query = Record<string, QueryValue>;

export interface TransportOptions {
  method?: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  query?: Query;
  /** Objeto (se serializa a JSON) o FormData (multipart). */
  body?: unknown;
  headers?: Record<string, string>;
  /** Access token en memoria. `null`/ausente → ruta pública, sin cabecera Authorization. */
  token?: string | null;
  /** UUID v4 por acción de usuario (RD-11). Se reutiliza en los reintentos de la misma acción. */
  correlationId?: string;
  idempotencyKey?: string;
  /** Solo ADMINISTRADOR operando en M4 en nombre de un prestador. */
  tenantId?: string;
  signal?: AbortSignal;
}

export interface GatewayResponse<T> {
  data: T;
  status: number;
  headers: Headers;
  correlationId: string;
}

export function buildQuery(query?: Query): string {
  if (!query) return "";
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(query)) {
    if (value === undefined || value === null || value === "") continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, String(v)));
    else params.append(key, String(value));
  }
  const text = params.toString();
  return text ? `?${text}` : "";
}

/**
 * Transporte de bajo nivel hacia el Gateway (vía BFF). Inyecta las cabeceras obligatorias del
 * contrato §1.2: X-Correlation-Id y Accept-Language siempre; Authorization si hay token;
 * Idempotency-Key / X-Tenant-Id cuando aplican.
 */
export async function transport<T>(path: string, options: TransportOptions = {}): Promise<GatewayResponse<T>> {
  if (!path.startsWith("/api/v1/")) {
    // R6: nunca se llama a /v1/... interno ni a hosts de M2–M10.
    throw new Error(`Ruta fuera del espacio del Gateway: ${path}`);
  }

  const correlationId = options.correlationId ?? crypto.randomUUID();
  const headers = new Headers(options.headers);
  headers.set("X-Correlation-Id", correlationId);
  headers.set("Accept-Language", getApiLocale());
  if (options.token) headers.set("Authorization", `Bearer ${options.token}`);
  if (options.idempotencyKey) headers.set("Idempotency-Key", options.idempotencyKey);
  if (options.tenantId) headers.set("X-Tenant-Id", options.tenantId);

  let body: BodyInit | undefined;
  if (options.body instanceof FormData) {
    body = options.body; // el navegador fija el boundary multipart
  } else if (options.body !== undefined) {
    body = JSON.stringify(options.body);
    headers.set("Content-Type", "application/json");
  }

  let response: Response;
  try {
    response = await fetch(`${BFF_BASE}${path}${buildQuery(options.query)}`, {
      method: options.method ?? "GET",
      headers,
      body,
      signal: options.signal,
      credentials: "same-origin", // la cookie httpOnly solo aplica a /bff/api/v1/identidad/sesiones*
      cache: "no-store",
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") throw error;
    throw networkError(correlationId);
  }

  const responseCorrelationId = response.headers.get("x-correlation-id") ?? correlationId;
  const contentType = response.headers.get("content-type") ?? "";

  if (!response.ok) {
    let errorBody: unknown = null;
    try {
      errorBody = contentType.includes("json") ? await response.json() : await response.text();
    } catch {
      /* cuerpo vacío */
    }
    throw normalizeError(response.status, errorBody, responseCorrelationId);
  }

  let data: unknown;
  if (response.status === 204 || response.status === 205) {
    data = undefined;
  } else if (contentType.includes("json")) {
    data = await response.json();
  } else if (/pdf|csv|octet-stream/.test(contentType)) {
    data = await response.blob();
  } else {
    const text = await response.text();
    data = text || undefined;
  }

  return { data: data as T, status: response.status, headers: response.headers, correlationId: responseCorrelationId };
}

export { ApiError };
