/**
 * Tokens simulados. El frontend solo DECODIFICA los claims (sub, rol, prestador_ref) para
 * pintar la UI y proteger rutas; la verificación ES256 real la hace el Gateway (CTR-M7-OUT-05).
 */
export type RolMock =
  | "TURISTA"
  | "PRESTADOR"
  | "ADMINISTRADOR"
  | "ANALISTA_TURISTICO"
  | "AUTORIDAD_AMBIENTAL"
  | "INTEGRADOR_TECNICO";

const b64url = (value: object | string): string =>
  Buffer.from(typeof value === "string" ? value : JSON.stringify(value)).toString("base64url");

export const MOCK_USERS: Record<
  string,
  { sub: string; rol: RolMock; prestador_ref?: string; mfa?: boolean; bloqueado?: boolean }
> = {
  "turista@vitasmarta.co": { sub: "11111111-1111-4111-8111-111111111111", rol: "TURISTA" },
  "prestador@vitasmarta.co": {
    sub: "22222222-2222-4222-8222-222222222222",
    rol: "PRESTADOR",
    prestador_ref: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa",
  },
  "admin@vitasmarta.co": {
    sub: "33333333-3333-4333-8333-333333333333",
    rol: "ADMINISTRADOR",
    mfa: true,
  },
  "analista@vitasmarta.co": { sub: "55555555-5555-4555-8555-555555555555", rol: "ANALISTA_TURISTICO" },
  "autoridad@vitasmarta.co": { sub: "66666666-6666-4666-8666-666666666666", rol: "AUTORIDAD_AMBIENTAL" },
  "bloqueado@vitasmarta.co": {
    sub: "44444444-4444-4444-8444-444444444444",
    rol: "TURISTA",
    bloqueado: true,
  },
};

export const MOCK_TOTP = "123456";
export const ACCESS_TTL_SECONDS = 900;

export function issueAccessToken(user: { sub: string; rol: RolMock; prestador_ref?: string }): string {
  const now = Math.floor(Date.now() / 1000);
  const header = b64url({ alg: "ES256", typ: "JWT" });
  const payload = b64url({
    sub: user.sub,
    rol: user.rol,
    ...(user.prestador_ref ? { prestador_ref: user.prestador_ref } : {}),
    jti: crypto.randomUUID(),
    iat: now,
    exp: now + ACCESS_TTL_SECONDS,
  });
  return `${header}.${payload}.mock-signature`;
}

/** El refresh mock codifica el correo para poder rotarlo sin estado. */
export const issueRefreshToken = (correo: string): string =>
  `mock-refresh-${b64url(correo)}-${crypto.randomUUID()}`;

export const correoFromRefresh = (token: string): string | null => {
  const match = /^mock-refresh-([A-Za-z0-9_-]+)-[0-9a-f-]{36}$/.exec(token);
  return match ? Buffer.from(match[1], "base64url").toString() : null;
};

export const issueMfaToken = (correo: string): string => `mock-mfa-${b64url(correo)}`;
export const correoFromMfa = (token: string): string | null =>
  token.startsWith("mock-mfa-") ? Buffer.from(token.slice(9), "base64url").toString() : null;
