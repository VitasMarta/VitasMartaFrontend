import { http, HttpResponse } from "msw";
import {
  ACCESS_TTL_SECONDS,
  MOCK_TOTP,
  MOCK_USERS,
  correoFromMfa,
  correoFromRefresh,
  issueAccessToken,
  issueMfaToken,
  issueRefreshToken,
} from "../fixtures/tokens";
import { errorBody, gw } from "../shared";

const tokenPair = (correo: string) => {
  const user = MOCK_USERS[correo];
  return {
    access_token: issueAccessToken(user),
    refresh_token: issueRefreshToken(correo),
    expira_en: ACCESS_TTL_SECONDS,
  };
};

/** M7 · Sesiones. Usuarios de prueba: ver `fixtures/tokens.ts` (contraseña cualquiera ≥ 12 caracteres). */
export const sesionesHandlers = [
  http.post(gw("/identidad/sesiones"), async ({ request }) => {
    const { correo, password } = (await request.json()) as { correo?: string; password?: string };
    const user = correo ? MOCK_USERS[correo] : undefined;
    if (!user || !password) {
      return HttpResponse.json(errorBody(request, "CREDENCIALES_INVALIDAS", "Correo o contraseña incorrectos"), { status: 401 });
    }
    if (user.bloqueado) {
      return HttpResponse.json(errorBody(request, "CUENTA_BLOQUEADA", "Cuenta bloqueada por 15 minutos"), { status: 423 });
    }
    if (user.mfa) return HttpResponse.json({ mfa_requerido: true, mfa_token: issueMfaToken(correo!) });
    return HttpResponse.json(tokenPair(correo!));
  }),

  http.post(gw("/identidad/sesiones/mfa"), async ({ request }) => {
    const { codigo_totp, mfa_token } = (await request.json()) as { codigo_totp?: string; mfa_token?: string };
    const correo = mfa_token ? correoFromMfa(mfa_token) : null;
    if (!correo || !MOCK_USERS[correo] || codigo_totp !== MOCK_TOTP) {
      return HttpResponse.json(errorBody(request, "MFA_INVALIDO", "El código de verificación no es válido"), { status: 401 });
    }
    return HttpResponse.json(tokenPair(correo));
  }),

  http.post(gw("/identidad/sesiones/refresco"), async ({ request }) => {
    const { refresh_token } = (await request.json()) as { refresh_token?: string };
    const correo = refresh_token ? correoFromRefresh(refresh_token) : null;
    if (!correo || !MOCK_USERS[correo]) {
      return HttpResponse.json(errorBody(request, "TOKEN_INVALIDO", "La sesión no es válida o expiró"), { status: 401 });
    }
    return HttpResponse.json(tokenPair(correo)); // rotación: el refresh anterior queda inválido
  }),

  http.delete(gw("/identidad/sesiones"), () => HttpResponse.json({ ok: true })),
];
