import type { NextRequest } from "next/server";
import {
  callGateway,
  clearRefreshCookie,
  correlationIdOf,
  errorEnvelope,
  gatewayUnavailable,
  tokenPairResponse,
} from "@/core/api/bffServer";
import { REFRESH_COOKIE } from "@/core/config/gateway";

export const dynamic = "force-dynamic";

/**
 * Refresco con rotación obligatoria (CTR-M7-OUT-02): el refresh_token sale de la
 * cookie httpOnly (el navegador no lo envía ni lo ve); el nuevo par reemplaza a la cookie.
 * 401 ⇒ sesión terminada: se limpia la cookie y el cliente cierra sesión.
 */
export async function POST(request: NextRequest) {
  const correlationId = correlationIdOf(request);
  const refreshToken = request.cookies.get(REFRESH_COOKIE)?.value;

  if (!refreshToken) {
    const response = errorEnvelope(
      401,
      "TOKEN_INVALIDO",
      "La sesión no es válida o expiró",
      correlationId,
    );
    clearRefreshCookie(response);
    return response;
  }

  try {
    const gatewayResponse = await callGateway(request, correlationId, {
      method: "POST",
      path: "/api/v1/identidad/sesiones/refresco",
      body: JSON.stringify({ refresh_token: refreshToken }),
      headers: { "content-type": "application/json" },
    });
    return await tokenPairResponse(gatewayResponse, correlationId);
  } catch {
    return gatewayUnavailable(correlationId);
  }
}
