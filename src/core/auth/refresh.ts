import { ApiError } from "@/core/api/errorNormalizer";
import { transport } from "@/core/api/transport";
import { useSessionStore } from "./sessionStore";

export const SESSION_PATH = "/api/v1/identidad/sesiones";

interface TokenResponse {
  access_token: string;
  expira_en?: number;
}

let inflight: Promise<boolean> | null = null;

/** Si hay un refresco en curso, las peticiones nuevas esperan a que termine (se "pausan"). */
export const pendingRefresh = (): Promise<boolean> | null => inflight;

/**
 * Refresco de sesión con rotación obligatoria (CTR-M7-OUT-02). Una sola llamada a
 * `POST /identidad/sesiones/refresco` aunque fallen varias peticiones a la vez (single-flight).
 * El refresh_token viaja en la cookie httpOnly; el BFF lo rota. Devuelve true si hay sesión.
 */
export function refreshSession(): Promise<boolean> {
  inflight ??= doRefresh().finally(() => {
    inflight = null;
  });
  return inflight;
}

async function doRefresh(): Promise<boolean> {
  try {
    const { data } = await transport<TokenResponse>(`${SESSION_PATH}/refresco`, { method: "POST" });
    return useSessionStore.getState().setAccessToken(data.access_token);
  } catch (error) {
    // 401 → sesión terminada (cerrar sesión en el frontend). Otros errores (red/503) no la destruyen.
    if (error instanceof ApiError && error.status === 401) useSessionStore.getState().clear();
    else if (useSessionStore.getState().status === "unknown") useSessionStore.getState().clear();
    return false;
  }
}
