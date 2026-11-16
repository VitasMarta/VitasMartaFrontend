import type { Rol } from "./rbacGuard";

export interface SessionUser {
  /** UUID del usuario (claim `sub`). */
  sub: string;
  rol: Rol;
  /** UUID del prestador (solo rol PRESTADOR). */
  prestadorRef?: string;
  /** Expiración del access token (epoch, segundos). */
  exp?: number;
}

const ROLES: readonly string[] = [
  "TURISTA",
  "PRESTADOR",
  "ADMINISTRADOR",
  "ANALISTA_TURISTICO",
  "AUTORIDAD_AMBIENTAL",
  "INTEGRADOR_TECNICO",
];

function decodeBase64Url(segment: string): string {
  const padded = segment.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(segment.length / 4) * 4, "=");
  const binary = atob(padded);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/**
 * Decodifica (NO verifica) los claims del JWT ES256 emitido por M7 (CTR-M7-OUT-05).
 * Solo sirve para pintar la UI y proteger rutas; la validación criptográfica la hace el Gateway.
 */
export function decodeAccessToken(token: string): SessionUser | null {
  try {
    const payload = JSON.parse(decodeBase64Url(token.split(".")[1] ?? ""));
    if (typeof payload.sub !== "string" || !ROLES.includes(payload.rol)) return null;
    return {
      sub: payload.sub,
      rol: payload.rol as Rol,
      prestadorRef: typeof payload.prestador_ref === "string" ? payload.prestador_ref : undefined,
      exp: typeof payload.exp === "number" ? payload.exp : undefined,
    };
  } catch {
    return null;
  }
}
