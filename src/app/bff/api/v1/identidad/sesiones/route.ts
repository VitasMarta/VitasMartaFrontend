import type { NextRequest } from "next/server";
import {
  callGateway,
  clearRefreshCookie,
  correlationIdOf,
  gatewayUnavailable,
  tokenPairResponse,
  toBffResponse,
} from "@/core/api/bffServer";

export const dynamic = "force-dynamic";

/** Login (CTR-M7-OUT-02): `{ correo, password }` → tokens o `{ mfa_requerido, mfa_token }`. */
export async function POST(request: NextRequest) {
  const correlationId = correlationIdOf(request);
  try {
    const gatewayResponse = await callGateway(request, correlationId, {
      method: "POST",
      path: "/api/v1/identidad/sesiones",
      body: await request.text(),
    });
    return await tokenPairResponse(gatewayResponse, correlationId);
  } catch {
    return gatewayUnavailable(correlationId);
  }
}

/** Logout: revoca el `jti` en M7 y SIEMPRE borra la cookie, aunque el Gateway falle. */
export async function DELETE(request: NextRequest) {
  const correlationId = correlationIdOf(request);
  try {
    const gatewayResponse = await callGateway(request, correlationId, {
      method: "DELETE",
      path: "/api/v1/identidad/sesiones",
    });
    const response = await toBffResponse(gatewayResponse, correlationId);
    clearRefreshCookie(response);
    return response;
  } catch {
    const response = gatewayUnavailable(correlationId);
    clearRefreshCookie(response);
    return response;
  }
}
