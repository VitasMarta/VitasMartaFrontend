import { NextResponse, type NextRequest } from "next/server";
import {
  GATEWAY_URL,
  REFRESH_COOKIE,
  REFRESH_COOKIE_MAX_AGE_SECONDS,
  REFRESH_COOKIE_PATH,
} from "@/core/config/gateway";

/**
 * Utilidades del BFF (solo servidor). El BFF es un proxy transparente hacia el
 * API Gateway (M1): reenvía el contrato HTTP tal cual y solo añade lo que el
 * navegador no puede hacer por seguridad (cookie httpOnly del refresh_token).
 */

/** Cabeceras del contrato (§1.2) que se reenvían al Gateway. */
const FORWARDED_REQUEST_HEADERS = [
  "authorization",
  "accept",
  "accept-language",
  "content-type",
  "idempotency-key",
  "x-correlation-id",
  "x-tenant-id",
] as const;

/** Cabeceras de respuesta del Gateway que llegan al navegador. */
const FORWARDED_RESPONSE_HEADERS = [
  "content-type",
  "content-disposition",
  "location",
  "retry-after",
  "x-correlation-id",
] as const;

export function correlationIdOf(request: NextRequest): string {
  return request.headers.get("x-correlation-id") ?? crypto.randomUUID();
}

function buildGatewayHeaders(request: NextRequest, correlationId: string): Headers {
  const headers = new Headers();
  for (const name of FORWARDED_REQUEST_HEADERS) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  headers.set("x-correlation-id", correlationId);
  if (!headers.has("accept-language")) headers.set("accept-language", "es-CO");
  return headers;
}

/** Envoltura de error estándar VITASMARTA (CTR-M1-OUT-06) generada por el propio BFF. */
export function errorEnvelope(
  status: number,
  codigo: string,
  mensaje: string,
  correlationId: string,
): NextResponse {
  return NextResponse.json(
    {
      codigo,
      mensaje,
      marca_temporal: new Date().toISOString(),
      correlation_id: correlationId,
    },
    { status, headers: { "x-correlation-id": correlationId } },
  );
}

export interface GatewayCallOptions {
  method: string;
  /** Ruta del Gateway, siempre `/api/v1/...` (R6). */
  path: string;
  search?: string;
  body?: BodyInit | null;
  /** Sobrescribe/ añade cabeceras (p. ej. Content-Type al construir un body propio). */
  headers?: Record<string, string>;
}

/** Llama al API Gateway (M1). Única salida de red del servidor hacia los backends. */
export async function callGateway(
  request: NextRequest,
  correlationId: string,
  { method, path, search = "", body, headers }: GatewayCallOptions,
): Promise<Response> {
  const outgoing = buildGatewayHeaders(request, correlationId);
  for (const [k, v] of Object.entries(headers ?? {})) outgoing.set(k, v);
  return fetch(`${GATEWAY_URL}${path}${search}`, {
    method,
    headers: outgoing,
    body: body ?? undefined,
    redirect: "manual", // OAuth inicio responde 302: se entrega al navegador sin seguirlo.
    cache: "no-store",
  });
}

/** Convierte la respuesta del Gateway en respuesta del BFF (status, cuerpo y cabeceras seguras). */
export async function toBffResponse(
  gatewayResponse: Response,
  correlationId: string,
): Promise<NextResponse> {
  const headers = new Headers();
  for (const name of FORWARDED_RESPONSE_HEADERS) {
    const value = gatewayResponse.headers.get(name);
    if (value) headers.set(name, value);
  }
  if (!headers.has("x-correlation-id")) headers.set("x-correlation-id", correlationId);
  const noBody = [101, 204, 205, 304].includes(gatewayResponse.status);
  return new NextResponse(noBody ? null : gatewayResponse.body, {
    status: gatewayResponse.status,
    headers,
  });
}

/** Errores de red hacia el Gateway → 503 SERVICIO_NO_DISPONIBLE (degradación, CTR-M1-OUT-06). */
export function gatewayUnavailable(correlationId: string): NextResponse {
  return errorEnvelope(
    503,
    "SERVICIO_NO_DISPONIBLE",
    "El servicio no está disponible en este momento",
    correlationId,
  );
}

export function setRefreshCookie(response: NextResponse, refreshToken: string): void {
  response.cookies.set(REFRESH_COOKIE, refreshToken, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: REFRESH_COOKIE_MAX_AGE_SECONDS,
  });
}

export function clearRefreshCookie(response: NextResponse): void {
  response.cookies.set(REFRESH_COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "strict",
    path: REFRESH_COOKIE_PATH,
    maxAge: 0,
  });
}

/**
 * Respuesta de login / MFA / refresco: si el Gateway entrega un par de tokens,
 * el `refresh_token` se mueve a la cookie httpOnly y NO llega al JavaScript del
 * navegador. El `access_token` sí se devuelve (el cliente lo guarda solo en memoria).
 * Cualquier otra respuesta (`mfa_requerido`, 401, 423…) se pasa intacta.
 */
export async function tokenPairResponse(
  gatewayResponse: Response,
  correlationId: string,
): Promise<NextResponse> {
  const raw = await gatewayResponse.text();
  let payload: unknown = null;
  try {
    payload = raw ? JSON.parse(raw) : null;
  } catch {
    /* cuerpo no JSON: se reenvía tal cual */
  }

  const refreshToken =
    gatewayResponse.ok && payload && typeof payload === "object"
      ? (payload as Record<string, unknown>).refresh_token
      : undefined;

  if (typeof refreshToken === "string") {
    const { refresh_token: _omit, ...publicPayload } = payload as Record<string, unknown>;
    void _omit;
    const response = NextResponse.json(publicPayload, {
      status: gatewayResponse.status,
      headers: { "x-correlation-id": correlationId },
    });
    setRefreshCookie(response, refreshToken);
    return response;
  }

  const response = new NextResponse(raw || null, {
    status: gatewayResponse.status,
    headers: {
      "content-type": gatewayResponse.headers.get("content-type") ?? "application/json",
      "x-correlation-id": correlationId,
    },
  });
  // Un 401 al refrescar/validar significa sesión terminada: se limpia la cookie.
  if (gatewayResponse.status === 401) clearRefreshCookie(response);
  return response;
}
