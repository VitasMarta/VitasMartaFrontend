import { gateway } from "@/core/api/gatewayClient";
import { transport } from "@/core/api/transport";
import { routes } from "@/core/api/routes";
import { SESSION_PATH, refreshSession } from "./refresh";
import { useSessionStore } from "./sessionStore";

interface TokenResponse {
  access_token: string;
  expira_en?: number;
  mfa_requerido?: boolean;
  mfa_token?: string;
}

export type LoginResult = { kind: "ok" } | { kind: "mfa"; mfaToken: string };

/**
 * Login (CTR-M7-OUT-02). Si el rol exige MFA (ADMINISTRADOR / INTEGRADOR_TECNICO) responde
 * `{ mfa_requerido: true, mfa_token }` y se continúa con `completeMfa`. 423 ⇒ cuenta bloqueada 15 min.
 */
export async function login(correo: string, password: string): Promise<LoginResult> {
  const { data } = await transport<TokenResponse>(routes.identidad.sesiones, {
    method: "POST",
    body: { correo, password },
  });
  if (data.mfa_requerido && data.mfa_token) return { kind: "mfa", mfaToken: data.mfa_token };
  if (!useSessionStore.getState().setAccessToken(data.access_token)) throw new Error("Token de acceso inválido");
  return { kind: "ok" };
}

export async function completeMfa(codigoTotp: string, mfaToken: string): Promise<void> {
  const { data } = await transport<TokenResponse>(routes.identidad.sesionesMfa, {
    method: "POST",
    body: { codigo_totp: codigoTotp, mfa_token: mfaToken },
  });
  if (!useSessionStore.getState().setAccessToken(data.access_token)) throw new Error("Token de acceso inválido");
}

/** Cierra la sesión: revoca el `jti` en M7 y borra el estado local aunque la llamada falle. */
export async function logout(): Promise<void> {
  try {
    await gateway(SESSION_PATH, { method: "DELETE" });
  } catch {
    /* la cookie se borra en el BFF; el estado local se limpia igualmente */
  } finally {
    useSessionStore.getState().clear();
  }
}

/** Al cargar la app: intenta restaurar la sesión con la cookie httpOnly (refresco silencioso). */
export async function bootstrapSession(): Promise<void> {
  if (useSessionStore.getState().status !== "unknown") return;
  await refreshSession();
}
