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
  /** Solo en el primer login de un rol con MFA: secreto TOTP (base32) para la app autenticadora. */
  secreto_enrolamiento?: string | null;
}

export type LoginResult = { kind: "ok" } | { kind: "mfa"; mfaToken: string; enrollmentSecret?: string };

/**
 * Login (CTR-M7-OUT-02). Si el rol exige MFA (ADMINISTRADOR / INTEGRADOR_TECNICO) responde
 * `{ mfa_requerido: true, mfa_token }` y se continúa con `completeMfa`. En el primer login M7
 * agrega `secreto_enrolamiento` una sola vez. 423 ⇒ cuenta bloqueada 15 min.
 */
export async function login(correo: string, password: string): Promise<LoginResult> {
  const { data } = await transport<TokenResponse>(routes.identidad.sesiones, {
    method: "POST",
    body: { correo, password },
  });
  if (data.mfa_requerido && data.mfa_token) {
    return { kind: "mfa", mfaToken: data.mfa_token, enrollmentSecret: data.secreto_enrolamiento ?? undefined };
  }
  if (!useSessionStore.getState().setAccessToken(data.access_token)) throw new Error("Token de acceso inválido");
  return { kind: "ok" };
}

/** M7 (`MfaRequest`): `{ mfa_token, codigo }`. */
export async function completeMfa(codigoTotp: string, mfaToken: string): Promise<void> {
  const { data } = await transport<TokenResponse>(routes.identidad.sesionesMfa, {
    method: "POST",
    body: { mfa_token: mfaToken, codigo: codigoTotp },
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
