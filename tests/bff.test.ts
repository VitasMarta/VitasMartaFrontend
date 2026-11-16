// @vitest-environment node
import { describe, expect, it } from "vitest";
import { NextRequest } from "next/server";
import { http, HttpResponse } from "msw";
import { server } from "@/mocks/node";
import { GATEWAY_URL, REFRESH_COOKIE } from "@/core/config/gateway";
import * as sesiones from "@/app/bff/api/v1/identidad/sesiones/route";
import * as mfa from "@/app/bff/api/v1/identidad/sesiones/mfa/route";
import * as refresco from "@/app/bff/api/v1/identidad/sesiones/refresco/route";
import * as proxy from "@/app/bff/[...path]/route";

const req = (path: string, init: ConstructorParameters<typeof NextRequest>[1] = {}) =>
  new NextRequest(`http://localhost:3000${path}`, init);
const json = (body: unknown) => ({
  method: "POST",
  body: JSON.stringify(body),
  headers: { "content-type": "application/json" },
});
const ctx = (path: string[]) => ({ params: Promise.resolve({ path }) });
const setCookieOf = (res: Response) => res.headers.get("set-cookie") ?? "";
const PASSWORD = "Passw0rd!Passw0rd";

describe("BFF · sesión (cookie httpOnly)", () => {
  it("login: entrega access_token y mueve el refresh_token a una cookie httpOnly", async () => {
    const res = await sesiones.POST(
      req("/bff/api/v1/identidad/sesiones", json({ correo: "turista@vitasmarta.co", password: PASSWORD })),
    );
    const body = await res.json();
    expect(res.status).toBe(200);
    expect(body.access_token).toBeTruthy();
    expect(body).not.toHaveProperty("refresh_token");
    const cookie = setCookieOf(res);
    expect(cookie).toContain(`${REFRESH_COOKIE}=mock-refresh-`);
    expect(cookie.toLowerCase()).toContain("httponly");
    expect(cookie.toLowerCase()).toContain("samesite=strict");
    expect(cookie).toContain("Path=/bff/api/v1/identidad/sesiones");
  });

  it("login admin: devuelve mfa_requerido + mfa_token sin cookie; el MFA correcto la crea", async () => {
    const login = await sesiones.POST(
      req("/bff/api/v1/identidad/sesiones", json({ correo: "admin@vitasmarta.co", password: PASSWORD })),
    );
    const { mfa_requerido, mfa_token } = await login.json();
    expect(mfa_requerido).toBe(true);
    expect(setCookieOf(login)).toBe("");

    const bad = await mfa.POST(
      req("/bff/api/v1/identidad/sesiones/mfa", json({ codigo_totp: "000000", mfa_token })),
    );
    expect(bad.status).toBe(401);

    const ok = await mfa.POST(
      req("/bff/api/v1/identidad/sesiones/mfa", json({ codigo_totp: "123456", mfa_token })),
    );
    expect(ok.status).toBe(200);
    expect(setCookieOf(ok)).toContain(REFRESH_COOKIE);
  });

  it("login bloqueado: propaga 423 sin cookie", async () => {
    const res = await sesiones.POST(
      req("/bff/api/v1/identidad/sesiones", json({ correo: "bloqueado@vitasmarta.co", password: PASSWORD })),
    );
    expect(res.status).toBe(423);
    expect(setCookieOf(res)).toBe("");
  });

  it("refresco: sin cookie → 401 TOKEN_INVALIDO y limpia la cookie", async () => {
    const res = await refresco.POST(req("/bff/api/v1/identidad/sesiones/refresco", { method: "POST" }));
    expect(res.status).toBe(401);
    expect((await res.json()).codigo).toBe("TOKEN_INVALIDO");
    expect(setCookieOf(res)).toContain("Max-Age=0");
  });

  it("refresco: con cookie rota el refresh_token (cookie nueva distinta)", async () => {
    const login = await sesiones.POST(
      req("/bff/api/v1/identidad/sesiones", json({ correo: "turista@vitasmarta.co", password: PASSWORD })),
    );
    const first = /vm_rt=([^;]+)/.exec(setCookieOf(login))![1];
    const res = await refresco.POST(
      req("/bff/api/v1/identidad/sesiones/refresco", {
        method: "POST",
        headers: { cookie: `${REFRESH_COOKIE}=${first}` },
      }),
    );
    expect(res.status).toBe(200);
    expect((await res.json()).access_token).toBeTruthy();
    const second = /vm_rt=([^;]+)/.exec(setCookieOf(res))![1];
    expect(second).not.toBe(first);
  });

  it("logout: borra la cookie aunque el Gateway falle", async () => {
    server.use(http.delete(`${GATEWAY_URL}/api/v1/identidad/sesiones`, () => HttpResponse.error()));
    const res = await sesiones.DELETE(req("/bff/api/v1/identidad/sesiones", { method: "DELETE" }));
    expect(res.status).toBe(503);
    expect(setCookieOf(res)).toContain("Max-Age=0");
  });
});

describe("BFF · proxy transparente hacia el Gateway", () => {
  it("reenvía a /api/v1/... con X-Correlation-Id, Accept-Language y Authorization", async () => {
    let seen: Headers | undefined;
    server.use(
      http.get(`${GATEWAY_URL}/api/v1/catalogo/categorias`, ({ request }) => {
        seen = request.headers;
        return HttpResponse.json([]);
      }),
    );
    const res = await proxy.GET(
      req("/bff/api/v1/catalogo/categorias", {
        headers: {
          "x-correlation-id": "d8f2a4c6-1e3b-4f5a-9c7d-2b4e6f8a0d13",
          "accept-language": "en-US",
          authorization: "Bearer t",
        },
      }),
      ctx(["api", "v1", "catalogo", "categorias"]),
    );
    expect(res.status).toBe(200);
    expect(seen?.get("x-correlation-id")).toBe("d8f2a4c6-1e3b-4f5a-9c7d-2b4e6f8a0d13");
    expect(seen?.get("accept-language")).toBe("en-US");
    expect(seen?.get("authorization")).toBe("Bearer t");
  });

  it("genera X-Correlation-Id si falta y preserva la query", async () => {
    let url = "";
    let cid: string | null = null;
    server.use(
      http.get(`${GATEWAY_URL}/api/v1/catalogo/busqueda`, ({ request }) => {
        url = request.url;
        cid = request.headers.get("x-correlation-id");
        return HttpResponse.json({ items: [] });
      }),
    );
    await proxy.GET(
      req("/bff/api/v1/catalogo/busqueda?texto=tayrona&limite=5"),
      ctx(["api", "v1", "catalogo", "busqueda"]),
    );
    expect(url).toContain("?texto=tayrona&limite=5");
    expect(cid).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("R6: rechaza rutas fuera de /api/v1 (404) sin tocar el Gateway", async () => {
    for (const path of [
      ["v1", "atractivos", "x"],
      ["api", "v2", "a", "b"],
      ["api", "v1", "..", "x"],
    ]) {
      const res = await proxy.GET(req(`/bff/${path.join("/")}`), ctx(path));
      expect(res.status).toBe(404);
    }
  });

  it("Gateway caído → 503 SERVICIO_NO_DISPONIBLE con la envoltura estándar", async () => {
    server.use(http.get(`${GATEWAY_URL}/api/v1/recomendaciones`, () => HttpResponse.error()));
    const res = await proxy.GET(req("/bff/api/v1/recomendaciones"), ctx(["api", "v1", "recomendaciones"]));
    const body = await res.json();
    expect(res.status).toBe(503);
    expect(body.codigo).toBe("SERVICIO_NO_DISPONIBLE");
    expect(body.correlation_id).toBeTruthy();
  });

  it("propaga el 206 de M6 y el 204 de M8 sin cuerpo", async () => {
    server.use(
      http.get(`${GATEWAY_URL}/api/v1/recomendaciones`, () =>
        HttpResponse.json({ degradada: true }, { status: 206 }),
      ),
      http.get(
        `${GATEWAY_URL}/api/v1/ambiental/atractivos/a1/buenas-practicas`,
        () => new HttpResponse(null, { status: 204 }),
      ),
    );
    const r206 = await proxy.GET(req("/bff/api/v1/recomendaciones"), ctx(["api", "v1", "recomendaciones"]));
    expect(r206.status).toBe(206);
    const r204 = await proxy.GET(
      req("/bff/api/v1/ambiental/atractivos/a1/buenas-practicas"),
      ctx(["api", "v1", "ambiental", "atractivos", "a1", "buenas-practicas"]),
    );
    expect(r204.status).toBe(204);
    expect(await r204.text()).toBe("");
  });
});
