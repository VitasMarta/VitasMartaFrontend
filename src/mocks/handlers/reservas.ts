import { http, HttpResponse } from "msw";
import { CATALOGO, politicaDe } from "../data/catalogo";
import { MOCK_USERS } from "../fixtures/tokens";
import { claimsOf, errorBody, forbidden, gw, isoDay, pageOf, tinyPdf, unauthorized } from "../shared";

interface ReservaMock {
  reserva_ref: string;
  owner: string;
  prestador_ref: string;
  codigo_confirmacion: string;
  estado: string;
  fecha_inicio: string;
  fecha_fin: string;
  vence_en: string | null;
  tarifa: { monto: number; moneda: string };
  politica: { politica_ref: string; version: number; descripcion: string };
  instrucciones_pago_externo: string | null;
  siguiente_accion: string | null;
  penalidad_aplicada_porcentaje: number | null;
  original_ref: string | null;
  reemplazo_ref: string | null;
  servicio_nombre: Record<string, string>;
  servicio_ref: string;
  cantidad_cupos: number;
}

const TURISTA = MOCK_USERS["turista@vitasmarta.co"].sub;
const PRESTADOR_REF = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";

const POLITICA_TXT = "Cancelación gratuita hasta 24 horas antes. Después se aplica una penalidad del 20 %.";
const reservas: ReservaMock[] = [];
const claves = new Map<string, { operacion: string; reserva_ref: string | null }>();
const creadasPorClave = new Map<string, string>();

function crear(owner: string, servicioRef: string, franjaRef: string, cupos: number, estado?: string): ReservaMock {
  const servicio = CATALOGO.find((c) => c.id === servicioRef)!;
  const [, fecha, hora] = /^[^-]+-\d+-(\d{4}-\d{2}-\d{2})-(\d{2}:\d{2})$/.exec(franjaRef) ?? [];
  const inicio = fecha ? `${fecha}T${hora}:00-05:00` : new Date().toISOString();
  const pendiente = servicio.id !== "atr-003" && !estado;
  const ref = `RES-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
  const r: ReservaMock = {
    reserva_ref: ref,
    owner,
    prestador_ref: servicio.prestador_ref,
    codigo_confirmacion: ref.slice(4),
    estado: estado ?? (pendiente ? "PENDIENTE_CONFIRMACION" : "CONFIRMADA"),
    fecha_inicio: inicio,
    fecha_fin: inicio,
    vence_en: pendiente ? new Date(Date.now() + 10 * 60_000).toISOString() : null,
    tarifa: { monto: (servicio.precio ?? 0) * cupos, moneda: "COP" },
    politica: { ...politicaDe(), descripcion: POLITICA_TXT },
    instrucciones_pago_externo: pendiente ? "El pago se realiza directamente con el prestador al llegar al destino." : null,
    siguiente_accion: pendiente ? "Esperando confirmación del prestador. Tu cupo está retenido temporalmente." : null,
    penalidad_aplicada_porcentaje: null,
    original_ref: null,
    reemplazo_ref: null,
    servicio_nombre: servicio.nombre,
    servicio_ref: servicio.id,
    cantidad_cupos: cupos,
  };
  reservas.unshift(r);
  return r;
}

// Datos de partida del turista de prueba
(() => {
  const past = crear(TURISTA, "atr-003", `atr-003-${isoDay(-12)}-09:00`, 2, "CONFIRMADA");
  past.fecha_inicio = `${isoDay(-12)}T09:30:00-05:00`;
  const cancelada = crear(TURISTA, "atr-002", `atr-002-${isoDay(6)}-07:00`, 1, "CANCELADA");
  cancelada.penalidad_aplicada_porcentaje = 0;
  crear(TURISTA, "atr-005", `atr-005-${isoDay(4)}-07:00`, 3, "CONFIRMADA");
  void PRESTADOR_REF;
})();

const clasificar = (r: ReservaMock) =>
  r.estado === "CANCELADA" || r.estado === "RECHAZADA" || r.estado === "MODIFICADA"
    ? "CANCELADAS"
    : new Date(r.fecha_fin).getTime() < Date.now()
      ? "PASADAS"
      : "ACTIVAS";

const visibles = (claims: { sub: string; rol: string; prestador_ref?: string }) =>
  reservas.filter((r) => (claims.rol === "PRESTADOR" ? r.prestador_ref === claims.prestador_ref : r.owner === claims.sub));

const view = ({ owner: _o, prestador_ref: _p, ...rest }: ReservaMock) => {
  void _o;
  void _p;
  return rest;
};

/** M3 · Reservas. Requiere `Idempotency-Key` emitido por `POST /reservas/claves-idempotencia`. */
export const reservasHandlers = [
  http.post(gw("/reservas/claves-idempotencia"), async ({ request }) => {
    if (!claimsOf(request)) return unauthorized(request);
    const body = (await request.json()) as { operacion: string; reserva_ref: string | null };
    const clave = crypto.randomUUID();
    claves.set(clave, body);
    return HttpResponse.json({ clave_idempotencia: clave, operacion: body.operacion }, { status: 201 });
  }),

  http.post(gw("/reservas"), async ({ request }) => {
    const claims = claimsOf(request);
    if (!claims) return unauthorized(request);
    if (claims.rol !== "TURISTA") return forbidden(request);
    const key = request.headers.get("idempotency-key");
    if (!key || !claves.has(key)) {
      return HttpResponse.json(errorBody(request, "CLAVE_IDEMPOTENCIA_INVALIDA", "Falta o es inválida la clave de idempotencia"), { status: 400 });
    }
    // Reintento con la misma clave → misma reserva, sin descontar cupos dos veces.
    const previa = creadasPorClave.get(key);
    if (previa) return HttpResponse.json(view(reservas.find((r) => r.reserva_ref === previa)!), { status: 201 });

    const body = (await request.json()) as {
      servicio_ref: string;
      franja_ref: string;
      cantidad_cupos: number;
      aceptacion_politica?: { aceptada: boolean };
    };
    const servicio = CATALOGO.find((c) => c.id === body.servicio_ref);
    if (!servicio) return HttpResponse.json(errorBody(request, "NO_ENCONTRADO", "Servicio no encontrado"), { status: 404 });
    if (!body.aceptacion_politica?.aceptada) {
      return HttpResponse.json(errorBody(request, "POLITICA_NO_ACEPTADA", "Debes aceptar la política de cancelación", [{ campo: "aceptacion_politica", problema: "es obligatoria" }]), { status: 400 });
    }
    if (servicio.ocupacion >= 90) {
      return HttpResponse.json(errorBody(request, "RESERVA_RESTRINGIDA", "Este destino alcanzó su umbral crítico de capacidad y no admite nuevas reservas"), { status: 409 });
    }
    if (body.franja_ref.includes("-16:00") || body.cantidad_cupos > 24) {
      return HttpResponse.json(errorBody(request, "CUPO_INSUFICIENTE", "No hay cupos suficientes en esta franja"), { status: 409 });
    }
    const r = crear(claims.sub, body.servicio_ref, body.franja_ref, body.cantidad_cupos);
    creadasPorClave.set(key, r.reserva_ref);
    return HttpResponse.json(view(r), { status: 201 });
  }),

  http.get(gw("/reservas"), ({ request }) => {
    const claims = claimsOf(request);
    if (!claims) return unauthorized(request);
    const url = new URL(request.url);
    const clasificacion = url.searchParams.get("clasificacion");
    const rows = visibles(claims).filter((r) => !clasificacion || clasificar(r) === clasificacion);
    const { slice, page, size, total } = pageOf(rows, url, 0);
    return HttpResponse.json({ content: slice.map(view), total_elements: total, page, size });
  }),

  http.get(gw("/reservas/:ref/comprobante"), ({ request, params }) => {
    if (!claimsOf(request)) return unauthorized(request);
    return new HttpResponse(tinyPdf(`VITASMARTA - Comprobante ${params.ref}`), {
      headers: { "content-type": "application/pdf", "content-disposition": `attachment; filename="comprobante-${params.ref}.pdf"` },
    });
  }),

  http.get(gw("/reservas/:ref"), ({ request, params }) => {
    const claims = claimsOf(request);
    if (!claims) return unauthorized(request);
    const r = visibles(claims).find((x) => x.reserva_ref === params.ref);
    return r ? HttpResponse.json(view(r)) : HttpResponse.json(errorBody(request, "NO_ENCONTRADO", "No encontramos esta reserva"), { status: 404 });
  }),

  http.post(gw("/reservas/validaciones-qr"), async ({ request }) => {
    const claims = claimsOf(request);
    if (!claims) return unauthorized(request);
    if (claims.rol !== "PRESTADOR") return forbidden(request);
    const { token } = (await request.json()) as { token: string };
    const r = reservas.find((x) => x.reserva_ref === token);
    return r ? HttpResponse.json(view(r)) : HttpResponse.json(errorBody(request, "QR_INVALIDO", "El código QR no es válido"), { status: 404 });
  }),

  http.post(gw("/reservas/:ref/:accion"), async ({ request, params }) => {
    const claims = claimsOf(request);
    if (!claims) return unauthorized(request);
    const key = request.headers.get("idempotency-key");
    if (!key || !claves.has(key)) return HttpResponse.json(errorBody(request, "CLAVE_IDEMPOTENCIA_INVALIDA", "Falta o es inválida la clave de idempotencia"), { status: 400 });
    const r = visibles(claims).find((x) => x.reserva_ref === params.ref);
    if (!r) return HttpResponse.json(errorBody(request, "NO_ENCONTRADO", "No encontramos esta reserva"), { status: 404 });
    const accion = params.accion as string;
    const body = (await request.json().catch(() => ({}))) as { motivo?: string };

    if (accion === "cancelar") {
      const horas = (new Date(r.fecha_inicio).getTime() - Date.now()) / 3_600_000;
      r.estado = "CANCELADA";
      r.penalidad_aplicada_porcentaje = horas >= 24 ? 0 : 20;
      r.vence_en = null;
      r.siguiente_accion = null;
    } else if (accion === "confirmar" && claims.rol === "PRESTADOR") {
      r.estado = "CONFIRMADA";
      r.vence_en = null;
      r.siguiente_accion = null;
    } else if (accion === "rechazar" && claims.rol === "PRESTADOR") {
      r.estado = "RECHAZADA";
      r.vence_en = null;
      r.siguiente_accion = body.motivo ?? null;
    } else if (accion === "modificar" && claims.rol === "TURISTA") {
      const nuevo = body as unknown as { servicio_ref?: string; franja_ref?: string; cantidad_cupos?: number };
      const n = crear(claims.sub, nuevo.servicio_ref ?? r.servicio_ref, nuevo.franja_ref ?? `${r.servicio_ref}-${isoDay(2)}-07:00`, nuevo.cantidad_cupos ?? r.cantidad_cupos);
      n.original_ref = r.reserva_ref;
      r.estado = "MODIFICADA";
      r.reemplazo_ref = n.reserva_ref;
      return HttpResponse.json(view(n));
    } else {
      return forbidden(request);
    }
    return HttpResponse.json(view(r));
  }),
];
