import { NextResponse, type NextRequest } from "next/server";
import {
  callGateway,
  correlationIdOf,
  errorEnvelope,
  gatewayUnavailable,
  toBffResponse,
} from "@/core/api/bffServer";

export const dynamic = "force-dynamic";

/**
 * Proxy transparente BFF → API Gateway (M1).
 *   Navegador:  /bff/api/v1/{dominio}/**
 *   Gateway:    {NEXT_PUBLIC_GATEWAY_URL}/api/v1/{dominio}/**
 *
 * Solo se admite el espacio `/api/v1/**` (R6): cualquier otra ruta es 404, de modo que el
 * BFF no puede usarse para alcanzar M2–M10 ni hosts internos. Los handlers específicos de
 * `identidad/sesiones*` tienen precedencia sobre este catch-all (gestionan la cookie).
 */
type Context = { params: Promise<{ path: string[] }> };

async function proxy(request: NextRequest, { params }: Context): Promise<NextResponse> {
  const correlationId = correlationIdOf(request);
  const { path } = await params;

  const isAllowed =
    path.length >= 3 &&
    path[0] === "api" &&
    path[1] === "v1" &&
    path.every((segment) => segment !== ".." && segment !== "." && segment !== "");
  if (!isAllowed) {
    return errorEnvelope(404, "RUTA_NO_ENCONTRADA", "Ruta no encontrada", correlationId);
  }

  const hasBody = !["GET", "HEAD"].includes(request.method);
  try {
    const gatewayResponse = await callGateway(request, correlationId, {
      method: request.method,
      path: `/${path.map(encodeURIComponent).join("/")}`,
      search: request.nextUrl.search,
      body: hasBody ? await request.arrayBuffer() : undefined,
    });
    return await toBffResponse(gatewayResponse, correlationId);
  } catch {
    return gatewayUnavailable(correlationId);
  }
}

export const GET = proxy;
export const POST = proxy;
export const PUT = proxy;
export const PATCH = proxy;
export const DELETE = proxy;
