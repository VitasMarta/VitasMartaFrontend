/**
 * Configuración del API Gateway (M1). SOLO para código de servidor (BFF / instrumentation).
 * El navegador nunca conoce esta URL: habla con el mismo origen vía `/bff/...`.
 */
export const GATEWAY_URL = (
  process.env.NEXT_PUBLIC_GATEWAY_URL ?? "http://localhost:8080"
).replace(/\/+$/, "");

/** Prefijo del BFF (Route Handlers de Next) que usa el navegador. */
export const BFF_PREFIX = "/bff";

/** Cookie httpOnly con el refresh_token (RNF-04). Nunca es legible desde JS. */
export const REFRESH_COOKIE = "vm_rt";

/**
 * Ámbito de la cookie: solo viaja a los handlers de sesión
 * (`/bff/api/v1/identidad/sesiones`, `/mfa`, `/refresco`).
 */
export const REFRESH_COOKIE_PATH = `${BFF_PREFIX}/api/v1/identidad/sesiones`;

/** Vigencia de la cookie. Supuesto: el contrato de M7 no define el TTL del refresh_token. */
export const REFRESH_COOKIE_MAX_AGE_SECONDS = 60 * 60 * 24 * 7;
