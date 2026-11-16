import { http, HttpResponse } from "msw";
import { MOCK_USERS } from "../fixtures/tokens";
import { claimsOf, errorBody, gw, isoDay, pageOf, tinyPdf, unauthorized, forbidden } from "../shared";

type Finalidad = "TRATAMIENTO" | "COMERCIAL" | "PERFILADO";
const FINALIDADES: Finalidad[] = ["TRATAMIENTO", "COMERCIAL", "PERFILADO"];

const consentimientos = new Map<string, Record<Finalidad, boolean>>();
const preferencias = new Map<string, Record<string, unknown>>();
const intereses = new Map<string, string[]>();
const perfiles = new Map<string, Record<string, unknown>>();
const arco: { id: string; owner: string; tipo: string; detalle?: string; estado: string; paso_actual: number; fecha_solicitud: string }[] = [];

const consentsOf = (sub: string) => {
  if (!consentimientos.has(sub)) consentimientos.set(sub, { TRATAMIENTO: true, COMERCIAL: false, PERFILADO: true });
  return consentimientos.get(sub)!;
};

/** M6 consulta a M7 (CTR-M7-OUT-06): ¿el titular consintió el perfilado con IA? */
export const consentimientoPerfilado = (sub: string) => consentsOf(sub).PERFILADO;

// Usuarios para el panel de administración (M7)
// Forma real de M7 (`UsuarioListaResponse`).
const usuarios: { usuario_ref: string; correo: string; rol: string; estado: string; prestador_ref: string | null; fecha_registro: string }[] = [
  ...Object.entries(MOCK_USERS).map(([correo, u]) => ({ usuario_ref: u.sub, correo, rol: u.rol, estado: u.bloqueado ? "BLOQUEADA" : "ACTIVA", prestador_ref: u.prestador_ref ?? null, fecha_registro: new Date().toISOString() })),
  ...Array.from({ length: 23 }, (_, i) => ({
    usuario_ref: `00000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}`,
    correo: `usuario${i + 1}@correo.co`,
    rol: (["TURISTA", "TURISTA", "PRESTADOR", "ANALISTA_TURISTICO"] as const)[i % 4],
    estado: "ACTIVA",
    prestador_ref: null,
    fecha_registro: new Date(Date.now() - i * 3_600_000).toISOString(),
  })),
];

// Forma real de M7 (`MatrizResponse`): un permiso por (rol, recurso, acción).
const permisosIniciales = [
  ["TURISTA", "reservas", "crear"], ["TURISTA", "reservas", "leer"], ["TURISTA", "reservas", "cancelar"],
  ["PRESTADOR", "oferta", "crear"], ["PRESTADOR", "oferta", "actualizar"],
  ["ADMINISTRADOR", "usuarios", "eliminar"], ["ANALISTA_TURISTICO", "reportes", "exportar"], ["AUTORIDAD_AMBIENTAL", "ambiental", "leer"],
].map(([rol, recurso, accion]) => ({ rol, recurso, accion, permitir: true }));
let matriz = { vigente: { version: 4, fecha_publicacion: new Date().toISOString(), responsable: "admin", permisos: permisosIniciales }, historial: [] as unknown[] };

const auditoria = Array.from({ length: 34 }, (_, i) => ({
  marca_temporal: new Date(Date.now() - i * 1_800_000).toISOString(),
  usuario: usuarios[i % usuarios.length].correo,
  rol: usuarios[i % usuarios.length].rol,
  accion: (["LOGIN", "CAMBIO_ROL", "CONSULTA", "ACTUALIZACION"] as const)[i % 4],
  recurso: (["sesiones", "usuarios", "reservas", "matriz"] as const)[i % 4],
  resultado: i % 7 === 0 ? "DENEGADO" : "EXITO",
  correlation_id: crypto.randomUUID(),
}));

export const identidadHandlers = [
  // ── Públicos: registro, verificación, recuperación, OAuth ───────────────────────────────────
  http.post(gw("/identidad/cuentas"), async ({ request }) => {
    const body = (await request.json()) as {
      correo?: string;
      tipo_usuario?: string;
      consentimientos?: { finalidad: string; otorgado?: boolean }[];
    };
    // M7 exige el consentimiento de TRATAMIENTO con `otorgado: true` (campos desconocidos se ignoran).
    if (!body.consentimientos?.some((c) => c.finalidad === "TRATAMIENTO" && c.otorgado === true)) {
      return HttpResponse.json(errorBody(request, "SOLICITUD_INVALIDA", "El consentimiento de tratamiento es obligatorio"), { status: 400 });
    }
    // M7 (S1): el autorregistro solo crea TURISTA; PRESTADOR lo asigna la administración.
    if (body.tipo_usuario && body.tipo_usuario !== "TURISTA") {
      return HttpResponse.json(errorBody(request, "SOLICITUD_INVALIDA", "El rol de prestador lo asigna la administración"), { status: 400 });
    }
    if (body.correo && MOCK_USERS[body.correo]) {
      return HttpResponse.json(errorBody(request, "CORREO_EN_USO", "No fue posible crear la cuenta con ese correo", [{ campo: "correo", problema: "ya está registrado" }]), { status: 409 });
    }
    return HttpResponse.json({ mensaje: "Cuenta creada. Revisa tu correo para verificarla." }, { status: 201 });
  }),
  http.post(gw("/identidad/cuentas/verificacion"), async ({ request }) => {
    const { token } = (await request.json()) as { token?: string };
    return token === "expirado"
      ? HttpResponse.json(errorBody(request, "TOKEN_EXPIRADO", "El enlace de verificación expiró"), { status: 400 })
      : HttpResponse.json({ ok: true });
  }),
  http.post(gw("/identidad/cuentas/reenvio-verificacion"), () => HttpResponse.json({ ok: true })),
  http.post(gw("/identidad/password/recuperacion"), () =>
    // Anti-enumeración: SIEMPRE 202 con el mismo mensaje.
    HttpResponse.json({ mensaje: "Si el correo está registrado, recibirás un enlace de recuperación" }, { status: 202 }),
  ),
  http.post(gw("/identidad/password/restablecimiento"), async ({ request }) => {
    const { token } = (await request.json()) as { token?: string };
    return token === "expirado"
      ? HttpResponse.json(errorBody(request, "TOKEN_EXPIRADO", "El enlace de recuperación expiró"), { status: 400 })
      : HttpResponse.json({ ok: true });
  }),
  http.get(gw("/identidad/oauth/:proveedor/inicio"), ({ params }) =>
    new HttpResponse(null, { status: 302, headers: { location: `/es-CO/login?oauth=${params.proveedor}` } }),
  ),

  // ── Titular: perfil, preferencias, intereses, consentimientos ───────────────────────────────
  http.get(gw("/identidad/usuarios/actual/perfil"), ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    const correo = Object.entries(MOCK_USERS).find(([, u]) => u.sub === c.sub)?.[0] ?? "usuario@correo.co";
    return HttpResponse.json({ correo, nombre: "Camila", apellido: "Restrepo", pais_residencia: "CO", telefono: "+57 300 000 0000", ...perfiles.get(c.sub) });
  }),
  http.put(gw("/identidad/usuarios/actual/perfil"), async ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    perfiles.set(c.sub, (await request.json()) as Record<string, unknown>);
    return HttpResponse.json({ ok: true });
  }),
  http.get(gw("/identidad/usuarios/actual/preferencias"), ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    return HttpResponse.json({ idioma_preferido: "es-CO", canal_autorizado: "EMAIL", idioma_autorizado: "es-CO", ...preferencias.get(c.sub) });
  }),
  http.put(gw("/identidad/usuarios/actual/preferencias"), async ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    const body = (await request.json()) as Record<string, unknown>;
    preferencias.set(c.sub, body);
    return HttpResponse.json(body);
  }),
  http.put(gw("/identidad/usuarios/actual/intereses"), async ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    const { intereses: lista } = (await request.json()) as { intereses: string[] };
    intereses.set(c.sub, lista);
    return HttpResponse.json({ intereses: lista });
  }),
  http.get(gw("/identidad/usuarios/actual/intereses"), ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    return HttpResponse.json({ intereses: intereses.get(c.sub) ?? ["naturaleza"] });
  }),
  http.get(gw("/identidad/usuarios/actual/consentimientos"), ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    const cs = consentsOf(c.sub);
    return HttpResponse.json(FINALIDADES.map((f) => ({ finalidad: f, otorgado: cs[f], version_terminos: "2026.1", fecha: isoDay(-10) })));
  }),
  http.put(gw("/identidad/usuarios/actual/consentimientos/:finalidad"), async ({ request, params }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    const f = params.finalidad as Finalidad;
    if (!FINALIDADES.includes(f)) return HttpResponse.json(errorBody(request, "FINALIDAD_INVALIDA", "Finalidad no válida"), { status: 400 });
    const { otorgado } = (await request.json()) as { otorgado: boolean };
    if (f === "TRATAMIENTO" && !otorgado) {
      return HttpResponse.json(errorBody(request, "CONSENTIMIENTO_OBLIGATORIO", "El tratamiento de datos es necesario para usar la cuenta"), { status: 422 });
    }
    consentsOf(c.sub)[f] = otorgado;
    return HttpResponse.json({ finalidad: f, otorgado });
  }),

  // ── ARCO (Ley 1581) ─────────────────────────────────────────────────────────────────────────
  http.post(gw("/identidad/usuarios/actual/solicitudes-arco"), async ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    const body = (await request.json()) as { tipo: string; detalle?: string };
    const row = { id: crypto.randomUUID(), owner: c.sub, tipo: body.tipo, detalle: body.detalle, estado: "RECIBIDA", paso_actual: 1, fecha_solicitud: new Date().toISOString() };
    arco.unshift(row);
    return HttpResponse.json(row, { status: 201 });
  }),
  http.get(gw("/identidad/usuarios/actual/solicitudes-arco"), ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    const mine = arco.filter((a) => a.owner === c.sub);
    if (mine.length === 0) {
      mine.push({ id: "arco-demo-1", owner: c.sub, tipo: "ACCESO", estado: "EN_REVISION", paso_actual: 3, fecha_solicitud: new Date(Date.now() - 4 * 86_400_000).toISOString(), detalle: "Quiero conocer qué datos tienen sobre mí." });
    }
    return HttpResponse.json(mine);
  }),
  http.get(gw("/identidad/usuarios/actual/solicitudes-arco/:id"), ({ request, params }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    const row = arco.find((a) => a.id === params.id) ?? { id: params.id, tipo: "ACCESO", estado: "EN_REVISION", paso_actual: 3, fecha_solicitud: new Date().toISOString() };
    return HttpResponse.json(row);
  }),
  http.get(gw("/identidad/usuarios/actual/exportacion-datos"), ({ request }) => {
    if (!claimsOf(request)) return unauthorized(request);
    return new HttpResponse(tinyPdf("VITASMARTA - Exportacion de datos personales"), {
      headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="datos-personales.pdf"' },
    });
  }),

  // ── Administración de usuarios (ADMINISTRADOR) ──────────────────────────────────────────────
  http.get(gw("/identidad/admin/usuarios"), ({ request }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    if (c.rol !== "ADMINISTRADOR") return forbidden(request);
    const url = new URL(request.url);
    const correo = (url.searchParams.get("correo") ?? "").toLowerCase();
    const rol = url.searchParams.get("rol");
    const rows = usuarios.filter((u) => (!correo || u.correo.includes(correo)) && (!rol || u.rol === rol));
    const { slice, page, size, total } = pageOf(rows, url, 0);
    return HttpResponse.json({ content: slice, page, size, totalElements: total });
  }),
  http.patch(gw("/identidad/admin/usuarios/:id/rol"), async ({ request, params }) => {
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    if (c.rol !== "ADMINISTRADOR") return forbidden(request);
    // M7 `CambiarRolRequest`: { rol_nuevo, prestador_ref } (PRESTADOR exige prestador_ref).
    const { rol_nuevo, prestador_ref } = (await request.json()) as { rol_nuevo?: string; prestador_ref?: string };
    if (!rol_nuevo) return HttpResponse.json(errorBody(request, "SOLICITUD_INVALIDA", "rol_nuevo es obligatorio"), { status: 400 });
    if (rol_nuevo === "PRESTADOR" && !prestador_ref) {
      return HttpResponse.json(errorBody(request, "SOLICITUD_INVALIDA", "El rol PRESTADOR exige prestador_ref"), { status: 400 });
    }
    const u = usuarios.find((x) => x.usuario_ref === params.id);
    if (!u) return HttpResponse.json(errorBody(request, "NO_ENCONTRADO", "Usuario no encontrado"), { status: 404 });
    u.rol = rol_nuevo;
    u.prestador_ref = rol_nuevo === "PRESTADOR" ? prestador_ref! : null;
    return HttpResponse.json({ mensaje: "El rol fue actualizado y el cambio quedó registrado en auditoría" });
  }),
  http.post(gw("/identidad/admin/usuarios/:id/desbloqueo"), ({ request, params }) => {
    if (claimsOf(request)?.rol !== "ADMINISTRADOR") return forbidden(request);
    const u = usuarios.find((x) => x.usuario_ref === params.id);
    if (u) u.estado = "ACTIVA";
    return HttpResponse.json({ mensaje: "La cuenta fue desbloqueada" });
  }),
  http.delete(gw("/identidad/admin/usuarios/:id"), ({ request, params }) => {
    if (claimsOf(request)?.rol !== "ADMINISTRADOR") return forbidden(request);
    const i = usuarios.findIndex((x) => x.usuario_ref === params.id);
    if (i >= 0) usuarios.splice(i, 1);
    return HttpResponse.json({ mensaje: "Cuenta eliminada" });
  }),
  http.get(gw("/identidad/admin/matriz-autorizacion"), ({ request }) =>
    claimsOf(request)?.rol === "ADMINISTRADOR" ? HttpResponse.json(matriz) : forbidden(request),
  ),
  http.put(gw("/identidad/admin/matriz-autorizacion"), async ({ request }) => {
    if (claimsOf(request)?.rol !== "ADMINISTRADOR") return forbidden(request);
    const { permisos } = (await request.json()) as { permisos: typeof permisosIniciales };
    const version = matriz.vigente.version + 1;
    matriz = { vigente: { version, fecha_publicacion: new Date().toISOString(), responsable: "admin", permisos }, historial: [matriz.vigente, ...matriz.historial] };
    return HttpResponse.json({ mensaje: "Matriz publicada", version });
  }),
  http.get(gw("/identidad/admin/auditoria"), ({ request }) => {
    if (claimsOf(request)?.rol !== "ADMINISTRADOR") return forbidden(request);
    const url = new URL(request.url);
    const q = (k: string) => (url.searchParams.get(k) ?? "").toLowerCase();
    const rows = auditoria.filter((a) => (!q("usuario") || a.usuario.includes(q("usuario"))) && (!q("recurso") || a.recurso.includes(q("recurso"))) && (!q("accion") || a.accion.toLowerCase().includes(q("accion"))));
    const { slice, page, size, total } = pageOf(rows, url, 0);
    return HttpResponse.json({ content: slice, page, size, totalElements: total });
  }),
];
