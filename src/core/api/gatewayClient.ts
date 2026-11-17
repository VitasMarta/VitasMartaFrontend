import { ApiError } from "./errorNormalizer";
import { transport, type GatewayResponse, type TransportOptions } from "./transport";
import { SESSION_PATH, pendingRefresh, refreshSession } from "@/core/auth/refresh";
import { useSessionStore } from "@/core/auth/sessionStore";

/**
 * Cliente HTTP ÚNICO hacia el API Gateway (M1) — guía §3.1. Todo el frontend lo usa (R5).
 *  1. X-Correlation-Id (UUID v4) por acción, reutilizado en el reintento tras refrescar.
 *  2. Accept-Language con el locale activo.
 *  3. Authorization: Bearer; ante 401 pausa las peticiones, refresca UNA vez y reintenta.
 *  4. Errores normalizados (`ApiError`); los 503 de módulos secundarios los degrada cada sección.
 */
export interface GatewayOptions extends Omit<TransportOptions, "token"> {
  /** `false` fuerza una llamada anónima (ruta pública). Por defecto se envía el token si existe. */
  auth?: boolean;
}

export async function gateway<T = unknown>(path: string, options: GatewayOptions = {}): Promise<GatewayResponse<T>> {
  const { auth = true, ...rest } = options;
  const correlationId = rest.correlationId ?? crypto.randomUUID();

  // Al recargar la página la sesión aún no está restaurada (status "unknown"): se espera al refresco silencioso
  // con la cookie httpOnly para no enviar la primera petición privada sin token (→ 401 espurio).
  if (auth && useSessionStore.getState().status === "unknown" && !path.startsWith(SESSION_PATH)) await refreshSession();
  const waiting = pendingRefresh();
  if (waiting) await waiting;

  const token = auth ? useSessionStore.getState().accessToken : null;

  try {
    return await transport<T>(path, { ...rest, correlationId, token });
  } catch (error) {
    const canRefresh =
      error instanceof ApiError && error.status === 401 && !!token && !path.startsWith(SESSION_PATH);
    if (!canRefresh) throw error;

    const refreshed = await refreshSession();
    if (!refreshed) throw error; // sesión terminada: el store ya quedó anónimo
    return transport<T>(path, { ...rest, correlationId, token: useSessionStore.getState().accessToken });
  }
}

type Verb = Omit<GatewayOptions, "method">;
export const api = {
  get: <T>(path: string, options?: Verb) => gateway<T>(path, { ...options, method: "GET" }),
  post: <T>(path: string, options?: Verb) => gateway<T>(path, { ...options, method: "POST" }),
  put: <T>(path: string, options?: Verb) => gateway<T>(path, { ...options, method: "PUT" }),
  patch: <T>(path: string, options?: Verb) => gateway<T>(path, { ...options, method: "PATCH" }),
  delete: <T>(path: string, options?: Verb) => gateway<T>(path, { ...options, method: "DELETE" }),
};
