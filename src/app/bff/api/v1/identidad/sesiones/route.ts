import type { NextRequest } from "next/server";
import {
  callGateway,
  clearRefreshCookie,
  correlationIdOf,
  gatewayUnavailable,
  tokenPairResponse,
  toBffResponse,
} from "@/core/api/bffServer";
import { REFRESH_COOKIE } from "@/core/config/gateway";

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

/**
 * Logout: revoca en M7 el `jti` del access y también el refresh de la cookie (FR-712; sin él la
 * sesión de refresco seguiría viva en M7 hasta su expiración). SIEMPRE borra la cookie.
 */
export async function DELETE(request: NextRequest) {
  const correlationId = correlationIdOf(request);
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;
  try {
    const gatewayResponse = await callGateway(request, correlationId, {
      method: "DELETE",
      path: "/api/v1/identidad/sesiones",
      ...(refreshToken
        ? { body: JSON.stringify({ refresh_token: refreshToken }), headers: { "content-type": "application/json" } }
        : {}),
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
