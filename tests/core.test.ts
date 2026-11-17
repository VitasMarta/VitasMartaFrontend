import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError, normalizeError } from "@/core/api/errorNormalizer";
import { buildQuery, transport } from "@/core/api/transport";
import { gateway } from "@/core/api/gatewayClient";
import { setApiLocale } from "@/core/api/locale";
import { m4, routes } from "@/core/api/routes";
import { IntentKeyCache } from "@/core/api/idempotency";
import { decodeAccessToken } from "@/core/auth/jwt";
import { canAccess } from "@/core/auth/rbacGuard";
import { useSessionStore } from "@/core/auth/sessionStore";
import { issueAccessToken, MOCK_USERS } from "@/mocks/fixtures/tokens";

type Call = { url: string; init: RequestInit; headers: Headers };
let calls: Call[] = [];

/** Sustituye `fetch` con un enrutador manual (las URL relativas del BFF no existen en Node). */
function stubFetch(route: (call: Call) => Response | Promise<Response>) {
  calls = [];
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string, init: RequestInit = {}) => {
      const call = { url, init, headers: new Headers(init.headers) };
      calls.push(call);
      return route(call);
    }),
  );
}
const json = (body: unknown, status = 200, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json", ...headers } });

const turista = MOCK_USERS["turista@vitasmarta.co"];

beforeEach(() => {
  useSessionStore.getState().clear();
  setApiLocale("es-CO");
});
afterEach(() => vi.unstubAllGlobals());

describe("errorNormalizer", () => {
  it("normaliza la envoltura estándar VITASMARTA con detalles de campo", () => {
    const err = normalizeError(400, {
      codigo: "VALIDACION",
      mensaje: "Datos inválidos",
      correlation_id: "abc",
      detalles: [{ campo: "umbral_critico", problema: "debe ser mayor que umbral_preventivo" }],
    });
    expect(err).toBeInstanceOf(ApiError);
    expect(err.codigo).toBe("VALIDACION");
    expect(err.message).toBe("Datos inválidos");
    expect(err.correlationId).toBe("abc");
    expect(err.fieldErrors()).toEqual({ umbral_critico: "debe ser mayor que umbral_preventivo" });
  });

  it("normaliza RFC 7807 de M4 (mensaje = detail) y detecta conflicto de versión", () => {
    const err = normalizeError(409, {
      type: "https://api.vitasmarta.co/errors/version-conflict",
      title: "Conflicto de version",
      status: 409,
      detail: "La version esperada 3 no coincide con la version actual 4",
      code: "version_conflict",
      trace_id: "6b0f3f9c4f7a4c1e",
    });
    expect(err.message).toBe("La version esperada 3 no coincide con la version actual 4");
    expect(err.isVersionConflict).toBe(true);
    expect(err.correlationId).toBe("6b0f3f9c4f7a4c1e");
  });

  it("cuerpos vacíos o no JSON dan un mensaje por defecto y marcan 503 como no disponible", () => {
    expect(normalizeError(503, null).isUnavailable).toBe(true);
    expect(normalizeError(500, "<html>").message).toMatch(/servicio/i);
  });
});

describe("transport · cabeceras del contrato §1.2", () => {
  it("siempre envía X-Correlation-Id (UUID v4) y Accept-Language; sin token no hay Authorization", async () => {
    stubFetch(() => json({ ok: true }));
    setApiLocale("en-US");
    await transport("/api/v1/catalogo/categorias");
    const h = calls[0].headers;
    expect(h.get("x-correlation-id")).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(h.get("accept-language")).toBe("en-US");
    expect(h.has("authorization")).toBe(false);
    expect(calls[0].url).toBe("/bff/api/v1/catalogo/categorias");
  });

  it("adjunta Authorization, Idempotency-Key y X-Tenant-Id cuando se indican", async () => {
    stubFetch(() => json({}));
    await transport("/api/v1/reservas", {
      method: "POST",
      token: "tok",
      idempotencyKey: "key-1",
      tenantId: "tenant-1",
      body: { a: 1 },
    });
    const h = calls[0].headers;
    expect(h.get("authorization")).toBe("Bearer tok");
    expect(h.get("idempotency-key")).toBe("key-1");
    expect(h.get("x-tenant-id")).toBe("tenant-1");
    expect(h.get("content-type")).toBe("application/json");
  });

  it("R6: rechaza rutas fuera de /api/v1/", async () => {
    stubFetch(() => json({}));
    await expect(transport("/v1/atractivos")).rejects.toThrow(/fuera del espacio/);
    expect(calls).toHaveLength(0);
  });

  it("buildQuery omite vacíos y repite arreglos", () => {
    expect(buildQuery({ texto: "a b", categorias: ["x", "y"], vacio: "", nulo: null, n: 0 })).toBe(
      "?texto=a+b&categorias=x&categorias=y&n=0",
    );
  });

  it("un fallo de red se convierte en ApiError RED (se degrada, no explota)", async () => {
    stubFetch(() => {
      throw new TypeError("fetch failed");
    });
    await expect(transport("/api/v1/recomendaciones")).rejects.toMatchObject({ codigo: "RED", status: 0 });
  });

  it("devuelve el status 206 y 204 sin tratarlos como error", async () => {
    stubFetch((c) =>
      c.url.includes("recomendaciones") ? json({ degradada: true }, 206) : new Response(null, { status: 204 }),
    );
    expect((await transport("/api/v1/recomendaciones")).status).toBe(206);
    const r = await transport("/api/v1/ambiental/atractivos/a/buenas-practicas");
    expect(r.status).toBe(204);
    expect(r.data).toBeUndefined();
  });
});

describe("gatewayClient · refresco de token", () => {
  const seed = () => useSessionStore.getState().setAccessToken(issueAccessToken(turista));

  it("ante 401 refresca UNA sola vez aunque fallen varias peticiones y reintenta con el token nuevo", async () => {
    seed();
    const stale = useSessionStore.getState().accessToken!;
    const fresh = issueAccessToken({ ...turista, sub: "99999999-9999-4999-8999-999999999999" });
    let refreshCalls = 0;
    stubFetch((c) => {
      if (c.url.endsWith("/identidad/sesiones/refresco")) {
        refreshCalls++;
        return json({ access_token: fresh });
      }
      return c.headers.get("authorization") === `Bearer ${fresh}` ? json({ ok: true }) : json({ codigo: "TOKEN_INVALIDO", mensaje: "x" }, 401);
    });

    const results = await Promise.all([
      gateway("/api/v1/reservas"),
      gateway("/api/v1/reservas/abc"),
      gateway("/api/v1/identidad/usuarios/actual/perfil"),
    ]);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(refreshCalls).toBe(1);
    expect(useSessionStore.getState().accessToken).toBe(fresh);
    expect(stale).not.toBe(fresh);
  });

  it("al recargar (sesión \"unknown\") restaura la sesión ANTES de la primera petición privada, sin 401 espurio", async () => {
    const fresh = issueAccessToken(turista);
    useSessionStore.setState({ status: "unknown", accessToken: null, user: null });
    stubFetch((c) => (c.url.endsWith("/refresco") ? json({ access_token: fresh }) : c.headers.get("authorization") === `Bearer ${fresh}` ? json({ ok: true }) : json({ codigo: "TOKEN_INVALIDO", mensaje: "x" }, 401)));
    const [a, b] = await Promise.all([gateway("/api/v1/reservas"), gateway("/api/v1/identidad/usuarios/actual/perfil")]);
    expect([a.status, b.status]).toEqual([200, 200]);
    expect(calls[0].url).toMatch(/refresco$/); // el refresco va primero
    expect(calls.filter((c) => c.url.endsWith("/refresco"))).toHaveLength(1); // single-flight
  });

  it("el reintento conserva el mismo X-Correlation-Id de la acción", async () => {
    seed();
    const fresh = issueAccessToken(turista);
    stubFetch((c) => {
      if (c.url.endsWith("/refresco")) return json({ access_token: fresh });
      return c.headers.get("authorization") === `Bearer ${fresh}` ? json({}) : json({ codigo: "TOKEN_INVALIDO", mensaje: "x" }, 401);
    });
    // token inicial distinto del fresco para forzar el 401
    useSessionStore.setState({ accessToken: "viejo" });
    await gateway("/api/v1/reservas", { method: "POST", body: {} });
    const business = calls.filter((c) => c.url.endsWith("/api/v1/reservas"));
    expect(business).toHaveLength(2);
    expect(business[0].headers.get("x-correlation-id")).toBe(business[1].headers.get("x-correlation-id"));
  });

  it("si el refresco falla con 401 cierra la sesión y propaga el error original", async () => {
    seed();
    stubFetch((c) => json({ codigo: "TOKEN_INVALIDO", mensaje: "expiró" }, 401, c.url.endsWith("/refresco") ? {} : {}));
    await expect(gateway("/api/v1/reservas")).rejects.toMatchObject({ status: 401 });
    expect(useSessionStore.getState().status).toBe("anonymous");
    expect(useSessionStore.getState().accessToken).toBeNull();
  });

  it("una ruta pública sin token no intenta refrescar", async () => {
    stubFetch(() => json({ codigo: "X", mensaje: "no" }, 401));
    await expect(gateway("/api/v1/catalogo/categorias")).rejects.toMatchObject({ status: 401 });
    expect(calls.some((c) => c.url.endsWith("/refresco"))).toBe(false);
  });

  it("un 401 de las rutas de sesión (login) no dispara refresco", async () => {
    seed();
    stubFetch(() => json({ codigo: "CREDENCIALES_INVALIDAS", mensaje: "no" }, 401));
    await expect(gateway("/api/v1/identidad/sesiones", { method: "POST", body: {} })).rejects.toBeInstanceOf(ApiError);
    expect(calls).toHaveLength(1);
  });
});

describe("auth · jwt y RBAC", () => {
  it("decodifica sub, rol y prestador_ref sin verificar firma", () => {
    const prestador = MOCK_USERS["prestador@vitasmarta.co"];
    expect(decodeAccessToken(issueAccessToken(prestador))).toMatchObject({
      sub: prestador.sub,
      rol: "PRESTADOR",
      prestadorRef: prestador.prestador_ref,
    });
    expect(decodeAccessToken("basura")).toBeNull();
  });

  it("canAccess respeta la matriz de áreas", () => {
    expect(canAccess("TURISTA", "turista")).toBe(true);
    expect(canAccess("TURISTA", "admin")).toBe(false);
    expect(canAccess("ADMINISTRADOR", "analitica")).toBe(true);
    expect(canAccess("AUTORIDAD_AMBIENTAL", "sostenibilidad")).toBe(true);
    expect(canAccess("PRESTADOR", "analitica")).toBe(false);
    expect(canAccess(undefined, "turista")).toBe(false);
  });
});

describe("routes · mapeo de M4 bajo /api/v1/prestadores/**", () => {
  it("reescribe /v1/... internos sin duplicar el segmento prestadores", () => {
    expect(m4("/v1/atractivos")).toBe("/api/v1/prestadores/atractivos");
    expect(m4("/v1/prestadores/mi-perfil")).toBe("/api/v1/prestadores/mi-perfil");
    expect(m4("/v1/admin/prestadores")).toBe("/api/v1/prestadores/admin/prestadores");
    expect(routes.prestadores.franja("f 1")).toBe("/api/v1/prestadores/franjas/f%201");
  });

  it("todas las rutas cuelgan de /api/v1/", () => {
    const collect = (o: unknown): string[] =>
      typeof o === "string" ? [o] : typeof o === "function" ? [] : o && typeof o === "object" ? Object.values(o).flatMap(collect) : [];
    const all = collect(routes);
    expect(all.length).toBeGreaterThan(20);
    expect(all.every((p) => p.startsWith("/api/v1/"))).toBe(true);
  });
});

describe("idempotency · IntentKeyCache", () => {
  it("reutiliza la clave mientras la intención no cambie (reintento tras corte de red)", async () => {
    const cache = new IntentKeyCache();
    let n = 0;
    const create = async () => `k${++n}`;
    expect(await cache.get("a", create)).toBe("k1");
    expect(await cache.get("a", create)).toBe("k1");
    expect(await cache.get("b", create)).toBe("k2");
    cache.reset();
    expect(await cache.get("b", create)).toBe("k3");
  });
});
