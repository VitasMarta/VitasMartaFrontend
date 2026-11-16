import { http, HttpResponse } from "msw";
import { claimsOf, errorBody, forbidden, gw, isoDay, pageOf, problemBody, unauthorized } from "../shared";

const DEFAULT_TENANT = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
type Tipo = "atractivos" | "actividades" | "eventos";

interface Contenido {
  id: string;
  tenant: string;
  tipo: Tipo;
  estado: string;
  version: number;
  [campo: string]: unknown;
}
const seed = (tipo: Tipo, n: number, estado: string, nombre: string, extra: Record<string, unknown> = {}): Contenido => ({
  id: `${tipo.slice(0, 3)}-${String(n).padStart(3, "0")}`,
  tenant: DEFAULT_TENANT,
  tipo,
  estado,
  version: estado === "borrador" ? 1 : 3,
  nombre: { es: nombre, en: nombre },
  descripcion: { es: `Descripción de ${nombre}`, en: `Description of ${nombre}` },
  categorias: ["naturaleza"],
  ubicacion: { lat: 11.24, lng: -74.2 },
  ...extra,
});
const contenidos: Contenido[] = [
  seed("atractivos", 1, "publicado", "Mirador El Cerro"),
  seed("atractivos", 2, "en_revision", "Sendero Los Naranjos"),
  seed("atractivos", 3, "borrador", "Bahía Escondida"),
  seed("actividades", 1, "publicado", "Kayak al amanecer", { duracion_minutos: 120, nivel_dificultad: "media", precio: { monto: 85000, moneda: "COP" }, capacidad_maxima: 10 }),
  seed("actividades", 2, "borrador", "Buceo de superficie", { duracion_minutos: 180, nivel_dificultad: "alta", precio: { monto: 150000, moneda: "COP" } }),
  seed("eventos", 1, "publicado", "Noche de música del Caribe", { fecha_inicio: `${isoDay(14)}T19:00:00-05:00`, fecha_fin: `${isoDay(14)}T23:00:00-05:00`, cupo_total: 200, modalidad: "presencial" }),
];
const historial = new Map<string, { de: string; a: string; motivo?: string; fecha: string; actor: string }[]>();
const multimedia = new Map<string, { id: string; tipo: string; url_cdn: string; tam_bytes: number; mime_type: string; orden: number }[]>();
const franjas: { id: string; contenido_id: string; fecha: string; hora_inicio: string; hora_fin: string; cupo_total: number; cupo_disponible: number; estado: string; version: number }[] = [
  { id: "fr-1", contenido_id: "atr-001", fecha: isoDay(2), hora_inicio: "08:00", hora_fin: "12:00", cupo_total: 20, cupo_disponible: 14, estado: "DISPONIBLE", version: 1 },
  { id: "fr-2", contenido_id: "atr-001", fecha: isoDay(3), hora_inicio: "08:00", hora_fin: "12:00", cupo_total: 20, cupo_disponible: 20, estado: "DISPONIBLE", version: 1 },
];
const perfiles = new Map<string, Record<string, unknown>>();
const config = new Map<string, Record<string, unknown>>();
const politicas = new Map<string, Record<string, unknown>>();
const claves = new Map<string, string>();

const perfilDe = (tenant: string) =>
  perfiles.get(tenant) ?? { id: tenant, version: 2, nombre_comercial: "Aventuras Sierra Mar", razon_social: "Aventuras Sierra Mar S.A.S.", descripcion: { es: "Operador de ecoturismo.", en: "Ecotourism operator." }, sitio_web: "https://example.co", estado: "aprobado" };

const tenantOf = (request: Request) => {
  const c = claimsOf(request);
  if (!c) return null;
  if (c.rol === "ADMINISTRADOR") return request.headers.get("x-tenant-id") ?? DEFAULT_TENANT;
  return c.prestador_ref ?? null;
};

/** Control de versionado optimista: `version_esperada` debe coincidir (RFC 7807 · 409 version_conflict). */
const conflict = (instance: string, esperada: number, actual: number) =>
  HttpResponse.json(problemBody(409, "version_conflict", "Conflicto de version", `La version esperada ${esperada} no coincide con la version actual ${actual}`, instance), { status: 409 });

/** MSW 3 no admite regex en parámetros: se valida dentro del resolver y se cede el paso (return) si no aplica. */
const isTipo = (p: unknown) => ["atractivos", "actividades", "eventos"].includes(String(p));

const solicitudes = new Map<string, Record<string, unknown>>();

const reservasM4 = Array.from({ length: 12 }, (_, i) => ({
  id: `rv-${i + 1}`,
  codigo_confirmacion: `K${String(1000 + i)}`,
  contenido_id: i % 2 ? "atr-001" : "act-001",
  servicio_nombre: i % 2 ? "Mirador El Cerro" : "Kayak al amanecer",
  turista: `Visitante ${i + 1}`,
  fecha_inicio: `${isoDay(i % 5 + 1)}T08:00:00-05:00`,
  cantidad_cupos: (i % 4) + 1,
  estado: ["PENDIENTE_CONFIRMACION", "CONFIRMADA", "CONFIRMADA", "CANCELADA"][i % 4],
  total: { monto: ((i % 4) + 1) * 85000, moneda: "COP" },
}));

export const prestadoresHandlers = [
  // ── Autoregistro ─────────────────────────────────────────────────────────────────────────────
  http.post(gw("/prestadores/solicitudes"), async ({ request }) => {
    if (!claimsOf(request)) return unauthorized(request);
    const body = (await request.json()) as Record<string, unknown>;
    if (String(body.nit ?? "").endsWith("0000")) {
      return HttpResponse.json(problemBody(422, "dato_invalido", "Datos invalidos", "El NIT ya esta registrado", "/v1/prestadores/solicitudes"), { status: 422 });
    }
    // Contrato real de M4: ambas finalidades obligatorias y respuesta `PrestadorPublico` (`id`).
    const aceptadas = new Set(((body.consentimientos as { finalidad: string; aceptado: boolean }[] | undefined) ?? []).filter((c) => c.aceptado).map((c) => c.finalidad));
    if (!aceptadas.has("tratamiento_datos_personales") || !aceptadas.has("terminos_servicio")) {
      return HttpResponse.json(problemBody(422, "consentimiento_obligatorio", "Consentimiento obligatorio", "Faltan consentimientos obligatorios", "/v1/prestadores/solicitudes"), { status: 422 });
    }
    const id = crypto.randomUUID();
    const ahora = new Date().toISOString();
    solicitudes.set(id, { prestador: { id, ...body, estado: "pendiente", version: 1 }, historial: [{ estado_origen: "nuevo", estado_destino: "pendiente", motivo: null, ocurrido_en: ahora, version_resultante: 1 }] });
    return HttpResponse.json({ id, tipo: body.tipo, segmento: body.segmento, estado: "pendiente", version: 1 }, { status: 201 });
  }),
  http.get(gw("/prestadores/solicitudes/:id"), ({ params }) => {
    if (params.id === "rechazada") {
      const motivo = "El RUT adjunto no coincide con la razón social.";
      return HttpResponse.json({
        prestador: { id: "rechazada", razon_social: "Demo S.A.S.", estado: "rechazado", motivo_estado: motivo, version: 2 },
        historial: [
          { estado_origen: "nuevo", estado_destino: "pendiente", motivo: null, ocurrido_en: isoDay(-3), version_resultante: 1 },
          { estado_origen: "pendiente", estado_destino: "rechazado", motivo, ocurrido_en: isoDay(-1), version_resultante: 2 },
        ],
      });
    }
    return HttpResponse.json(solicitudes.get(String(params.id)) ?? { prestador: { id: params.id, estado: "pendiente", version: 1 }, historial: [{ estado_origen: "nuevo", estado_destino: "pendiente", motivo: null, ocurrido_en: isoDay(0), version_resultante: 1 }] });
  }),
  http.post(gw("/prestadores/solicitudes/:id/reenviar"), async ({ params, request }) => {
    // `CorreccionesSolicitudSchema` (extra=forbid): no admite tipo, segmento, NIT ni consentimientos.
    const body = (await request.json().catch(() => ({}))) as Record<string, unknown>;
    const prohibidos = ["tipo", "segmento", "nit", "consentimientos"].filter((k) => k in body);
    if (prohibidos.length) {
      return HttpResponse.json(problemBody(422, "dato_invalido", "Datos invalidos", `Campos no permitidos: ${prohibidos.join(", ")}`, `/v1/prestadores/solicitudes/${params.id}/reenviar`), { status: 422 });
    }
    return HttpResponse.json({ id: params.id, estado: "pendiente", version: 3 });
  }),

  // ── Perfil, configuración y política ─────────────────────────────────────────────────────────
  http.get(gw("/prestadores/mi-perfil"), ({ request }) => {
    const t = tenantOf(request);
    return t ? HttpResponse.json(perfilDe(t)) : unauthorized(request);
  }),
  http.patch(gw("/prestadores/mi-perfil"), async ({ request }) => {
    const t = tenantOf(request);
    if (!t) return unauthorized(request);
    const { version_esperada, ...rest } = (await request.json()) as { version_esperada: number } & Record<string, unknown>;
    const actual = perfilDe(t);
    if (version_esperada !== actual.version) return conflict("/v1/prestadores/mi-perfil", version_esperada, actual.version as number);
    const nuevo = { ...actual, ...rest, version: (actual.version as number) + 1 };
    perfiles.set(t, nuevo);
    return HttpResponse.json(nuevo);
  }),
  http.get(gw("/prestadores/mi-perfil/configuracion-reservas"), ({ request }) => {
    const t = tenantOf(request);
    return t ? HttpResponse.json(config.get(t) ?? { version: 1, requiere_confirmacion_manual: true, tiempo_maximo_confirmacion_minutos: 120, instrucciones_pago: "Pago directo en el sitio.", medios_pago: ["efectivo", "transferencia"] }) : unauthorized(request);
  }),
  http.put(gw("/prestadores/mi-perfil/configuracion-reservas"), async ({ request }) => {
    const t = tenantOf(request);
    if (!t) return unauthorized(request);
    const body = (await request.json()) as { version_esperada: number } & Record<string, unknown>;
    const actual = (config.get(t) ?? { version: 1 }) as { version: number };
    if (body.version_esperada !== actual.version) return conflict("/v1/prestadores/mi-perfil/configuracion-reservas", body.version_esperada, actual.version);
    const nuevo = { ...body, version: actual.version + 1 };
    config.set(t, nuevo);
    return HttpResponse.json(nuevo);
  }),
  http.get(gw("/prestadores/mi-perfil/politica-cancelacion"), ({ request }) => {
    const t = tenantOf(request);
    return t ? HttpResponse.json(politicas.get(t) ?? { version: 1, tipo: "flexible", horas_limite_cancelacion: 24, penalidad_porcentaje: 20, descripcion: "Cancelación gratuita hasta 24 horas antes.", condiciones: "" }) : unauthorized(request);
  }),
  http.put(gw("/prestadores/mi-perfil/politica-cancelacion"), async ({ request }) => {
    const t = tenantOf(request);
    if (!t) return unauthorized(request);
    const body = (await request.json()) as { version_esperada: number } & Record<string, unknown>;
    const actual = (politicas.get(t) ?? { version: 1 }) as { version: number };
    if (body.version_esperada !== actual.version) return conflict("/v1/prestadores/mi-perfil/politica-cancelacion", body.version_esperada, actual.version);
    const nuevo = { ...body, version: actual.version + 1 };
    politicas.set(t, nuevo);
    return HttpResponse.json(nuevo);
  }),

  // ── Reservas recibidas, check-in e indicadores (rutas literales ANTES de /:tipo/:id) ─────────
  http.get(gw("/prestadores/reservas"), ({ request }) => {
    if (!tenantOf(request)) return unauthorized(request);
    const url = new URL(request.url);
    const estado = url.searchParams.get("estado");
    const rows = reservasM4.filter((r) => !estado || r.estado === estado);
    const { slice, page, size, total } = pageOf(rows, url, 1);
    return HttpResponse.json({ items: slice, total, page, page_size: size });
  }),
  http.post(gw("/prestadores/reservas/:id/:accion"), async ({ request, params }) => {
    if (!tenantOf(request)) return unauthorized(request);
    const key = request.headers.get("idempotency-key");
    if (!key) return HttpResponse.json(problemBody(400, "idempotency_key_requerida", "Falta Idempotency-Key", "La cabecera Idempotency-Key es obligatoria", `/v1/prestadores/reservas/${params.id}`), { status: 400 });
    const r = reservasM4.find((x) => x.id === params.id);
    if (!r) return HttpResponse.json(problemBody(404, "no_encontrado", "No encontrado", "Reserva no encontrada", `/v1/prestadores/reservas/${params.id}`), { status: 404 });
    const previo = claves.get(key);
    if (!previo) {
      r.estado = params.accion === "confirmar" ? "CONFIRMADA" : params.accion === "rechazar" ? "RECHAZADA" : "CANCELADA";
      claves.set(key, r.estado);
    }
    return HttpResponse.json(r);
  }),
  http.get(gw("/prestadores/reservas/:id"), ({ params }) => HttpResponse.json(reservasM4.find((x) => x.id === params.id) ?? {})),
  http.post(gw("/prestadores/check-in/validar"), async ({ request }) => {
    if (!tenantOf(request)) return unauthorized(request);
    const { codigo_qr } = (await request.json()) as { codigo_qr: string };
    if (codigo_qr === "LIMITE") return new HttpResponse(JSON.stringify(problemBody(429, "rate_limit", "Demasiadas solicitudes", "Límite de 30 validaciones por minuto", "/v1/prestadores/check-in/validar")), { status: 429, headers: { "content-type": "application/json", "retry-after": "20" } });
    const r = reservasM4.find((x) => x.codigo_confirmacion === codigo_qr || x.id === codigo_qr);
    return HttpResponse.json(
      r
        ? { valido: r.estado === "CONFIRMADA", reserva_id: r.id, estado: r.estado, contenido_id: r.contenido_id, mensaje: r.estado === "CONFIRMADA" ? "Reserva válida. Check-in registrado." : "La reserva no está confirmada.", validado_en: new Date().toISOString() }
        : { valido: false, reserva_id: null, estado: null, contenido_id: null, mensaje: "Código QR no reconocido.", validado_en: new Date().toISOString() },
    );
  }),
  http.get(gw("/prestadores/indicadores"), ({ request }) => {
    const t = tenantOf(request);
    if (!t) return unauthorized(request);
    const url = new URL(request.url);
    return HttpResponse.json({
      tenant_id: t,
      desde: url.searchParams.get("desde") ?? isoDay(-30),
      hasta: url.searchParams.get("hasta") ?? isoDay(0),
      indicadores: { reservas_total: 128, reservas_confirmadas: 97, reservas_canceladas: 14, ingresos_cop: 8_450_000, ocupacion_promedio_porcentaje: 68.4, contenidos_publicados: contenidos.filter((c) => c.tenant === t && c.estado === "publicado").length },
      series: Array.from({ length: 8 }, (_, i) => ({ periodo: isoDay(-7 * (7 - i)), reservas: 10 + ((i * 7) % 9), ingresos_cop: 700_000 + i * 90_000 })),
    });
  }),

  // ── Oferta: atractivos / actividades / eventos ───────────────────────────────────────────────
  http.get(gw("/prestadores/:tipo"), ({ request, params }) => {
    if (!isTipo(params.tipo)) return;
    const t = tenantOf(request);
    if (!t) return unauthorized(request);
    const url = new URL(request.url);
    const estado = url.searchParams.get("estado");
    const rows = contenidos.filter((c) => c.tenant === t && c.tipo === params.tipo && (!estado || c.estado === estado));
    const { slice, page, size, total } = pageOf(rows, url, 1);
    return HttpResponse.json({ items: slice, total, page, page_size: size });
  }),
  http.post(gw("/prestadores/:tipo"), async ({ request, params }) => {
    if (!isTipo(params.tipo)) return;
    const t = tenantOf(request);
    if (!t) return unauthorized(request);
    const body = (await request.json()) as Record<string, unknown>;
    const operador = body.operador as Record<string, unknown> | undefined;
    if (operador && ("email" in operador || "telefono" in operador)) {
      return HttpResponse.json(problemBody(422, "dato_comercial_sensible", "Dato comercial sensible", "El operador no puede incluir correo ni teléfono", `/v1/${params.tipo}`), { status: 422 });
    }
    const nuevo: Contenido = { ...body, id: `${String(params.tipo).slice(0, 3)}-${String(contenidos.length + 10).padStart(3, "0")}`, tenant: t, tipo: params.tipo as Tipo, estado: "borrador", version: 1 };
    contenidos.push(nuevo);
    return HttpResponse.json(nuevo, { status: 201 });
  }),
  http.get(gw("/prestadores/:tipo/:id"), ({ params, request }) => {
    if (!isTipo(params.tipo)) return;
    const c = contenidos.find((x) => x.id === params.id);
    return c ? HttpResponse.json(c) : HttpResponse.json(problemBody(404, "no_encontrado", "No encontrado", "Contenido no encontrado", new URL(request.url).pathname), { status: 404 });
  }),
  http.patch(gw("/prestadores/:tipo/:id"), async ({ params, request }) => {
    if (!isTipo(params.tipo)) return;
    const c = contenidos.find((x) => x.id === params.id);
    if (!c) return HttpResponse.json(problemBody(404, "no_encontrado", "No encontrado", "Contenido no encontrado", `/v1/${params.tipo}/${params.id}`), { status: 404 });
    const { version_esperada, ...rest } = (await request.json()) as { version_esperada: number } & Record<string, unknown>;
    if (version_esperada !== c.version) return conflict(`/v1/${params.tipo}/${params.id}`, version_esperada, c.version);
    if (c.estado === "publicado") {
      return HttpResponse.json(problemBody(409, "contenido_publicado", "Contenido publicado", "El contenido publicado no se edita directamente: usa la acción de corrección", `/v1/${params.tipo}/${params.id}`), { status: 409 });
    }
    Object.assign(c, rest, { version: c.version + 1 });
    return HttpResponse.json(c);
  }),

  // ── Flujo editorial, historial, multimedia, franjas ──────────────────────────────────────────
  http.post(gw("/prestadores/contenido/:id/:accion"), async ({ params, request }) => {
    if (params.accion !== "enviar-revision" && params.accion !== "corregir") return;
    const c = contenidos.find((x) => x.id === params.id);
    if (!c) return HttpResponse.json(problemBody(404, "no_encontrado", "No encontrado", "Contenido no encontrado", `/v1/contenido/${params.id}`), { status: 404 });
    const { motivo, version_esperada } = (await request.json()) as { motivo?: string; version_esperada: number };
    if (version_esperada !== c.version) return conflict(`/v1/contenido/${params.id}/${params.accion}`, version_esperada, c.version);
    const de = c.estado;
    c.estado = params.accion === "corregir" ? "borrador" : "en_revision";
    c.version += 1;
    historial.set(c.id, [...(historial.get(c.id) ?? []), { de, a: c.estado, motivo, fecha: new Date().toISOString(), actor: "prestador" }]);
    return HttpResponse.json(c);
  }),
  http.get(gw("/prestadores/contenido/:id/historial"), ({ params }) =>
    HttpResponse.json({ items: historial.get(String(params.id)) ?? [{ de: "—", a: "borrador", fecha: isoDay(-5), actor: "prestador" }], total: 1, page: 1, page_size: 20 }),
  ),
  http.put(gw("/prestadores/contenido/:id/multimedia/orden"), async ({ params, request }) => {
    const { items } = (await request.json()) as { items: { id: string; orden: number }[] };
    const list = multimedia.get(String(params.id)) ?? [];
    items.forEach((i) => { const m = list.find((x) => x.id === i.id); if (m) m.orden = i.orden; });
    return HttpResponse.json({ ok: true });
  }),
  http.get(gw("/prestadores/contenido/:id/multimedia"), ({ params }) => {
    if (!multimedia.has(String(params.id))) multimedia.set(String(params.id), [{ id: "m1", tipo: "foto", url_cdn: "/mock/gallery-a.svg", tam_bytes: 512_000, mime_type: "image/webp", orden: 1 }]);
    return HttpResponse.json([...multimedia.get(String(params.id))!].sort((a, b) => a.orden - b.orden));
  }),
  http.post(gw("/prestadores/contenido/:id/multimedia"), async ({ params, request }) => {
    const form = await request.formData();
    const archivo = form.get("archivo") as File | null;
    const tipo = String(form.get("tipo") ?? "foto");
    if (!archivo) return HttpResponse.json(problemBody(400, "archivo_requerido", "Archivo requerido", "Adjunta un archivo", `/v1/contenido/${params.id}/multimedia`), { status: 400 });
    const limite = tipo === "video" ? 50e6 : 10e6;
    if (archivo.size > limite) return HttpResponse.json(problemBody(413, "archivo_muy_grande", "Archivo muy grande", `El archivo supera ${limite / 1e6} MB`, `/v1/contenido/${params.id}/multimedia`), { status: 413 });
    const list = multimedia.get(String(params.id)) ?? [];
    const nuevo = { id: crypto.randomUUID(), tipo, url_cdn: "/mock/gallery-b.svg", tam_bytes: archivo.size, mime_type: archivo.type, orden: list.length + 1 };
    multimedia.set(String(params.id), [...list, nuevo]);
    return HttpResponse.json(nuevo, { status: 201 });
  }),
  http.delete(gw("/prestadores/contenido/:id/multimedia/:mid"), ({ params }) => {
    multimedia.set(String(params.id), (multimedia.get(String(params.id)) ?? []).filter((m) => m.id !== params.mid));
    return new HttpResponse(null, { status: 204 });
  }),
  http.get(gw("/prestadores/contenido/:id/franjas"), ({ params }) => HttpResponse.json({ items: franjas.filter((f) => f.contenido_id === params.id) })),
  http.post(gw("/prestadores/contenido/:id/franjas"), async ({ params, request }) => {
    const { franjas: nuevas } = (await request.json()) as { franjas: Omit<(typeof franjas)[number], "id" | "contenido_id" | "version">[] };
    const creadas = nuevas.map((f) => ({ ...f, id: crypto.randomUUID(), contenido_id: String(params.id), version: 1 }));
    franjas.push(...creadas);
    return HttpResponse.json({ items: creadas }, { status: 201 });
  }),
  http.patch(gw("/prestadores/franjas/:id"), async ({ params, request }) => {
    const f = franjas.find((x) => x.id === params.id);
    if (!f) return HttpResponse.json(problemBody(404, "no_encontrado", "No encontrado", "Franja no encontrada", `/v1/franjas/${params.id}`), { status: 404 });
    const { version_esperada, ...rest } = (await request.json()) as { version_esperada: number } & Record<string, unknown>;
    if (version_esperada !== f.version) return conflict(`/v1/franjas/${params.id}`, version_esperada, f.version);
    Object.assign(f, rest, { version: f.version + 1 });
    return HttpResponse.json(f);
  }),
  http.delete(gw("/prestadores/franjas/:id"), ({ params }) => {
    const i = franjas.findIndex((x) => x.id === params.id);
    if (i >= 0) franjas.splice(i, 1);
    return new HttpResponse(null, { status: 204 });
  }),

  // ── Administración (rol ADMINISTRADOR) ───────────────────────────────────────────────────────
  http.get(gw("/prestadores/admin/prestadores"), ({ request }) => {
    if (claimsOf(request)?.rol !== "ADMINISTRADOR") return forbidden(request);
    const url = new URL(request.url);
    const estado = url.searchParams.get("estado");
    const rows = adminPrestadores.filter((p) => (!estado || p.estado === estado) && (!url.searchParams.get("texto") || p.razon_social.toLowerCase().includes(url.searchParams.get("texto")!.toLowerCase())));
    const { slice, page, size, total } = pageOf(rows, url, 1);
    return HttpResponse.json({ items: slice, total, page, page_size: size });
  }),
  http.get(gw("/prestadores/admin/prestadores/:id"), ({ params }) => HttpResponse.json(adminPrestadores.find((p) => p.id === params.id) ?? {})),
  http.post(gw("/prestadores/admin/prestadores/:id/:accion"), async ({ request, params }) => {
    if (claimsOf(request)?.rol !== "ADMINISTRADOR") return forbidden(request);
    const p = adminPrestadores.find((x) => x.id === params.id);
    if (!p) return HttpResponse.json(problemBody(404, "no_encontrado", "No encontrado", "Prestador no encontrado", `/v1/admin/prestadores/${params.id}`), { status: 404 });
    const { motivo } = (await request.json().catch(() => ({}))) as { motivo?: string };
    if ((params.accion === "rechazar" || params.accion === "suspender") && !motivo) {
      return HttpResponse.json(problemBody(422, "motivo_requerido", "Motivo requerido", "Indica el motivo de la acción", `/v1/admin/prestadores/${params.id}/${params.accion}`), { status: 422 });
    }
    p.estado = ({ aprobar: "aprobado", rechazar: "rechazado", suspender: "suspendido", reactivar: "aprobado" } as Record<string, string>)[String(params.accion)] ?? p.estado;
    return HttpResponse.json(p);
  }),
  http.get(gw("/prestadores/admin/tipos-prestador"), () => HttpResponse.json({ items: tipos })),
  http.post(gw("/prestadores/admin/tipos-prestador"), async ({ request }) => {
    const body = (await request.json()) as (typeof tipos)[number];
    const nuevo = { ...body, id: crypto.randomUUID(), version: 1 };
    tipos.push(nuevo);
    return HttpResponse.json(nuevo, { status: 201 });
  }),
  http.patch(gw("/prestadores/admin/tipos-prestador/:id"), async ({ params, request }) => {
    const t = tipos.find((x) => x.id === params.id);
    const { version_esperada, ...rest } = (await request.json()) as { version_esperada: number } & Record<string, unknown>;
    if (!t) return HttpResponse.json({}, { status: 404 });
    if (version_esperada !== t.version) return conflict(`/v1/admin/tipos-prestador/${params.id}`, version_esperada, t.version);
    Object.assign(t, rest, { version: t.version + 1 });
    return HttpResponse.json(t);
  }),
  http.get(gw("/prestadores/admin/contenido/:id/proyeccion"), ({ params }) => HttpResponse.json(contenidos.find((c) => c.id === params.id) ?? {})),
  http.post(gw("/prestadores/admin/contenido/:id/:accion"), async ({ params, request }) => {
    if (claimsOf(request)?.rol !== "ADMINISTRADOR") return forbidden(request);
    const c = contenidos.find((x) => x.id === params.id);
    if (!c) return HttpResponse.json({}, { status: 404 });
    const mapa: Record<string, string> = { aprobar: "aprobado", publicar: "publicado", devolver: "borrador", rechazar: "rechazado", archivar: "archivado" };
    c.estado = mapa[String(params.accion)] ?? c.estado;
    c.version += 1;
    return HttpResponse.json(c);
  }),
  http.get(gw("/prestadores/admin/credenciales"), () => HttpResponse.json({ items: credenciales })),
  http.post(gw("/prestadores/admin/credenciales"), async ({ request }) => {
    if (!request.headers.get("x-tenant-id")) return HttpResponse.json(problemBody(400, "tenant_requerido", "Tenant requerido", "Indica X-Tenant-Id", "/v1/admin/credenciales"), { status: 400 });
    const cred = { id: crypto.randomUUID(), tenant_id: request.headers.get("x-tenant-id")!, prefijo: `vm_${crypto.randomUUID().slice(0, 6)}`, estado: "activa", creada: new Date().toISOString() };
    credenciales.push(cred);
    return HttpResponse.json({ ...cred, api_key: `vmk_${crypto.randomUUID().replace(/-/g, "")}` }, { status: 201 });
  }),
  http.delete(gw("/prestadores/admin/credenciales/:id"), ({ params }) => {
    const c = credenciales.find((x) => x.id === params.id);
    if (c) c.estado = "revocada";
    return HttpResponse.json(c ?? {});
  }),
  http.get(gw("/prestadores/admin/auditoria"), ({ request }) => {
    const url = new URL(request.url);
    const rows = Array.from({ length: 25 }, (_, i) => ({ fecha: new Date(Date.now() - i * 2_400_000).toISOString(), actor: "admin@vitasmarta.co", accion: ["aprobar_prestador", "publicar_contenido", "emitir_credencial"][i % 3], recurso: `recurso-${i}`, tenant_id: DEFAULT_TENANT }));
    const { slice, page, size, total } = pageOf(rows, url, 1);
    return HttpResponse.json({ items: slice, total, page, page_size: size });
  }),
  http.get(gw("/prestadores/admin/outbox"), () =>
    HttpResponse.json({ items: [{ id: "ob-1", evento: "contenido.publicado", estado: "ENVIADO", intentos: 1 }, { id: "ob-2", evento: "prestador.aprobado", estado: "FALLIDO", intentos: 4 }], total: 2 }),
  ),
  http.post(gw("/prestadores/admin/outbox/:id/reintentar"), ({ params }) => HttpResponse.json({ id: params.id, estado: "PENDIENTE" })),
];

const adminPrestadores = [
  { id: DEFAULT_TENANT, razon_social: "Aventuras Sierra Mar S.A.S.", nombre_comercial: "Aventuras Sierra Mar", tipo: "operador", estado: "aprobado", email: "contacto@sierramar.co" },
  { id: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb", razon_social: "Hotel Brisas del Mar Ltda.", nombre_comercial: "Hotel Brisas", tipo: "alojamiento", estado: "pendiente", email: "info@brisas.co" },
  { id: "cccccccc-cccc-4ccc-8ccc-cccccccccccc", razon_social: "Sabores del Caribe S.A.S.", nombre_comercial: "Sabores del Caribe", tipo: "gastronomia", estado: "pendiente", email: "hola@sabores.co" },
  { id: "dddddddd-dddd-4ddd-8ddd-dddddddddddd", razon_social: "Guías Tayrona S.A.S.", nombre_comercial: "Guías Tayrona", tipo: "guia", estado: "suspendido", email: "guias@tayrona.co" },
];
const tipos: { id: string; codigo: string; nombre: string; atributos_schema: Record<string, unknown>; version: number }[] = [
  { id: "t1", codigo: "operador", nombre: "Operador turístico", atributos_schema: { type: "object", properties: { rnt: { type: "string" } }, required: ["rnt"] }, version: 1 },
  { id: "t2", codigo: "alojamiento", nombre: "Alojamiento", atributos_schema: { type: "object", properties: { habitaciones: { type: "integer" } } }, version: 2 },
];
const credenciales: { id: string; tenant_id: string; prefijo: string; estado: string; creada: string }[] = [
  { id: "cr-1", tenant_id: DEFAULT_TENANT, prefijo: "vm_a1b2c3", estado: "activa", creada: isoDay(-20) },
];
void errorBody;
