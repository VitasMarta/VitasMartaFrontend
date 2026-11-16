import type { NextRequest } from "next/server";
import {
  callGateway,
  correlationIdOf,
  gatewayUnavailable,
  tokenPairResponse,
} from "@/core/api/bffServer";

export const dynamic = "force-dynamic";

/** Completa el login con MFA: `{ codigo_totp, mfa_token }` → `{ access_token, expira_en }` + cookie. */
export async function POST(request: NextRequest) {
  const correlationId = correlationIdOf(request);
  try {
    const gatewayResponse = await callGateway(request, correlationId, {
      method: "POST",
      path: "/api/v1/identidad/sesiones/mfa",
      body: await request.text(),
    });
    return await tokenPairResponse(gatewayResponse, correlationId);
  } catch {
    return gatewayUnavailable(correlationId);
  }
}
