import { http, HttpResponse } from "msw";
import { CATALOGO } from "../data/catalogo";
import { claimsOf, errorBody, forbidden, gw, isoDay, pageOf, tinyPdf, unauthorized } from "../shared";

const ADMIN_ROLES = ["ADMINISTRADOR"];
const AMBIENTAL_READ = ["ADMINISTRADOR", "AUTORIDAD_AMBIENTAL"];
const ANALITICA = ["ANALISTA_TURISTICO", "ADMINISTRADOR", "PRESTADOR"];

const allow = (request: Request, roles: string[]) => {
  const c = claimsOf(request);
  if (!c) return unauthorized(request);
  return roles.includes(c.rol) ? null : forbidden(request);
};

// ── M8 · configuración de capacidad (versiones inmutables) ───────────────────────────────────────
interface Cfg {
  capacidad_carga: number;
  umbral_recomendacion: number;
  umbral_preventivo: number;
  umbral_critico: number;
  fuente_criterio: string;
  vigencia_desde: string;
  vigencia_hasta: string;
  responsable: string;
  version: number;
  restriccion_reservas: boolean;
  criterio_vencido: boolean;
}
const versiones = new Map<string, Cfg[]>();
// Forma real de M8 (`CambioConfiguracionResponse`).
const cambios = new Map<string, { campo: string; valor_anterior: string | null; valor_modificado: string | null; usuario: string; fecha: string; hora: string; version_resultante: number }[]>();
const versionesDe = (id: string) => {
  if (!versiones.has(id)) {
    versiones.set(id, [{ capacidad_carga: 1000, umbral_recomendacion: 80, umbral_preventivo: 85, umbral_critico: 90, fuente_criterio: "Resolución CORPAMAG 2024", vigencia_desde: isoDay(-120), vigencia_hasta: isoDay(240), responsable: "admin@vitasmarta.co", version: 1, restriccion_reservas: true, criterio_vencido: false }]);
  }
  return versiones.get(id)!;
};

const alertas = [
  { id: 1, atractivo_ref: "atr-001", tipo: "PREVENTIVA", estado: "ACTIVA", ocupacion_al_cruce: 86.4, umbral_al_cruce: 85, marca_temporal_activacion: new Date(Date.now() - 3_600_000).toISOString() },
  { id: 2, atractivo_ref: "atr-008", tipo: "CRITICA", estado: "ACTIVA", ocupacion_al_cruce: 93, umbral_al_cruce: 85, marca_temporal_activacion: new Date(Date.now() - 7_200_000).toISOString() },
  { id: 3, atractivo_ref: "atr-001", tipo: "PREVENTIVA", estado: "RECONOCIDA", ocupacion_al_cruce: 85.2, umbral_al_cruce: 85, marca_temporal_activacion: new Date(Date.now() - 86_400_000).toISOString(), usuario_responsable: "admin@vitasmarta.co" },
  { id: 4, atractivo_ref: "atr-002", tipo: "PREVENTIVA", estado: "CERRADA", ocupacion_al_cruce: 85.7, umbral_al_cruce: 85, marca_temporal_activacion: new Date(Date.now() - 3 * 86_400_000).toISOString(), usuario_responsable: "admin@vitasmarta.co" },
] as { id: number; atractivo_ref: string; tipo: string; estado: string; ocupacion_al_cruce: number; umbral_al_cruce: number; marca_temporal_activacion: string; usuario_responsable?: string }[];

const nombre = (ref: string) => CATALOGO.find((c) => c.id === ref)?.nombre["es-CO"] ?? ref;
const FLUJO = { "06-10": 0.18, "10-14": 0.34, "14-18": 0.31, "18-22": 0.17 };

// ── M9 · exportaciones asíncronas (el estado avanza con el tiempo) ───────────────────────────────
const jobs = new Map<string, { formato: "PDF" | "CSV"; creado: number; owner: string; falla?: boolean }>();
const jobState = (j: { creado: number; falla?: boolean }) => {
  const dt = Date.now() - j.creado;
  if (j.falla && dt > 3000) return "FALLIDO";
  return dt < 2500 ? "ENCOLADO" : dt < 5500 ? "GENERANDO" : "DISPONIBLE";
};

export const institucionalHandlers = [
  // ── M1 · salud de servicios ──────────────────────────────────────────────────────────────────
  http.get(gw("/estado/servicios"), ({ request }) => {
    const denied = allow(request, ADMIN_ROLES);
    if (denied) return denied;
    // Forma real de M1 (`EstadoServicio`).
    const ahora = new Date().toISOString();
    const s = (servicio: string, salud: string, latencia_ms: number) => ({ servicio, salud, latencia_ms, ultima_verificacion: ahora });
    return HttpResponse.json({
      servicios: [
        s("svc-catalogo", "SANO", 48), s("svc-reservas", "SANO", 61), s("svc-prestadores", "SANO", 55), s("svc-integracion", "DEGRADADO", 640),
        s("svc-recomendaciones", "SANO", 380), s("svc-identidad", "SANO", 33), s("svc-ambiental", "SANO", 41), s("svc-reportes", "SANO", 72), s("svc-notificaciones", "CAIDO", -1),
      ],
    });
  }),

  // ── M8 · ambiental ───────────────────────────────────────────────────────────────────────────
  http.post(gw("/ambiental/atractivos/:id/buenas-practicas"), async ({ request, params }) => {
    const denied = allow(request, ADMIN_ROLES);
    if (denied) return denied;
    const c = CATALOGO.find((x) => x.id === params.id);
    if (!c?.natural) return HttpResponse.json(errorBody(request, "ATRACTIVO_NO_NATURAL", "El atractivo no es de tipo natural"), { status: 400 });
    return HttpResponse.json({ atractivo_ref: c.id, fecha_publicacion: isoDay(0), ...((await request.json()) as object) }, { status: 201 });
  }),
  http.get(gw("/ambiental/atractivos/:id/configuracion-capacidad/versiones"), ({ request, params }) =>
    // M8: `PaginaResponse<VersionConfiguracionResponse>`.
    allow(request, ADMIN_ROLES) ?? HttpResponse.json({ content: [...versionesDe(String(params.id))].reverse().map((v) => ({ version: v.version, fecha_creacion: new Date().toISOString(), responsable: v.responsable, vigencia_desde: v.vigencia_desde, vigencia_hasta: v.vigencia_hasta })), page: 0, size: 20, totalElements: versionesDe(String(params.id)).length }),
  ),
  http.get(gw("/ambiental/atractivos/:id/configuracion-capacidad/auditoria"), ({ request, params }) =>
    allow(request, ADMIN_ROLES) ?? HttpResponse.json(cambios.get(String(params.id)) ?? []),
  ),
  http.get(gw("/ambiental/atractivos/:id/configuracion-capacidad"), ({ request, params }) => {
    const v = versionesDe(String(params.id));
    return allow(request, AMBIENTAL_READ) ?? HttpResponse.json(v[v.length - 1]);
  }),
  http.all(gw("/ambiental/atractivos/:id/configuracion-capacidad"), async ({ request, params }) => {
    if (request.method !== "POST" && request.method !== "PUT") return;
    const c = claimsOf(request);
    if (!c) return unauthorized(request);
    if (c.rol !== "ADMINISTRADOR") return forbidden(request); // AUTORIDAD_AMBIENTAL → 403 (solo lectura)
    const body = (await request.json()) as Cfg;
    const detalles: { campo: string; problema: string }[] = [];
    if (body.umbral_critico <= body.umbral_preventivo) detalles.push({ campo: "umbral_critico", problema: "debe ser mayor que umbral_preventivo" });
    if (body.umbral_preventivo <= body.umbral_recomendacion) detalles.push({ campo: "umbral_preventivo", problema: "debe ser mayor que umbral_recomendacion" });
    if (detalles.length) return HttpResponse.json(errorBody(request, "VALIDACION", "La configuración no es válida", detalles), { status: 400 });
    const lista = versionesDe(String(params.id));
    const previa = lista[lista.length - 1];
    const nueva = { ...body, version: previa.version + 1, responsable: "admin@vitasmarta.co" };
    lista.push(nueva);
    const log = cambios.get(String(params.id)) ?? [];
    (Object.keys(nueva) as (keyof Cfg)[]).filter((k) => k !== "version" && nueva[k] !== previa[k]).forEach((k) => log.unshift({ campo: k, valor_anterior: previa[k] == null ? null : String(previa[k]), valor_modificado: nueva[k] == null ? null : String(nueva[k]), usuario: "admin@vitasmarta.co", fecha: new Date().toISOString().slice(0, 10), hora: new Date().toISOString().slice(11, 19), version_resultante: nueva.version! }));
    cambios.set(String(params.id), log);
    return HttpResponse.json(nueva, { status: request.method === "POST" ? 201 : 200 });
  }),
  http.post(gw("/ambiental/atractivos/:id/conflictos-fuente"), ({ request }) => allow(request, ADMIN_ROLES) ?? HttpResponse.json({ ok: true }, { status: 201 })),
  http.get(gw("/ambiental/atractivos/:id/ocupacion-estimada"), ({ request, params }) => {
    const c = CATALOGO.find((x) => x.id === params.id);
    return (
      allow(request, ADMIN_ROLES) ??
      // Forma real de M8 (`OcupacionResponse`).
      HttpResponse.json({
        atractivo_ref: params.id,
        valor: (c?.ocupacion ?? 40).toFixed(2),
        ventana_movil_minutos: 240,
        insumo_reservas: 12,
        insumo_consultas: 30,
        insumo_disponibilidad: 20,
        insumo_fuentes_externas: 0,
        ajuste_no_show: "0.00",
        marca_temporal: new Date().toISOString(),
        ciclo_id: "c-1",
      })
    );
  }),
  http.get(gw("/ambiental/atractivos/:id/historico"), ({ request, params }) => {
    const base = CATALOGO.find((x) => x.id === params.id)?.ocupacion ?? 50;
    const url = new URL(request.url);
    // M8 exige desde/hasta (sin ellos responde error) y devuelve la ocupación por ciclo de monitoreo.
    if (!url.searchParams.get("desde") || !url.searchParams.get("hasta")) {
      return HttpResponse.json(errorBody(request, "PARAMETRO_INVALIDO", "desde y hasta son obligatorios"), { status: 400 });
    }
    return allow(request, ADMIN_ROLES) ?? HttpResponse.json({
      atractivo_ref: params.id, desde: url.searchParams.get("desde"), hasta: url.searchParams.get("hasta"), meses_retencion: 12,
      ocupacion_estimada: Array.from({ length: 12 }, (_, i) => ({ valor: Math.round(base - 15 + ((i * 11) % 30)), marca_temporal: `${isoDay(-14 * (11 - i))}T12:00:00Z`, ciclo_id: `c-${i}` })),
      alertas: [], cambios_configuracion: [],
    });
  }),
  http.get(gw("/ambiental/alertas"), ({ request }) => {
    const denied = allow(request, ADMIN_ROLES);
    if (denied) return denied;
    const url = new URL(request.url);
    const estado = url.searchParams.get("estado") ?? "TODAS";
    const rows = alertas.filter((a) => estado === "TODAS" || a.estado === estado);
    const { slice, page, size, total } = pageOf(rows, url, 0);
    return HttpResponse.json({ content: slice, page, size, totalElements: total });
  }),
  http.post(gw("/ambiental/alertas/:id/reconocimiento"), ({ request, params }) => {
    const denied = allow(request, ADMIN_ROLES);
    if (denied) return denied;
    const a = alertas.find((x) => String(x.id) === params.id);
    if (!a) return HttpResponse.json(errorBody(request, "NO_ENCONTRADO", "Alerta no encontrada"), { status: 404 });
    a.estado = "RECONOCIDA";
    a.usuario_responsable = "admin@vitasmarta.co";
    return HttpResponse.json(a);
  }),
  http.post(gw("/ambiental/alertas/:id/cierre"), ({ request, params }) => {
    const denied = allow(request, ADMIN_ROLES);
    if (denied) return denied;
    const a = alertas.find((x) => String(x.id) === params.id);
    if (!a) return HttpResponse.json(errorBody(request, "NO_ENCONTRADO", "Alerta no encontrada"), { status: 404 });
    if (a.estado === "ACTIVA") return HttpResponse.json(errorBody(request, "ALERTA_NO_RECONOCIDA", "La alerta debe reconocerse antes de cerrarse"), { status: 409 });
    a.estado = "CERRADA";
    return HttpResponse.json(a);
  }),
  http.get(gw("/ambiental/indicadores-agregados"), ({ request }) => {
    const denied = allow(request, AMBIENTAL_READ);
    if (denied) return denied;
    const url = new URL(request.url);
    const only = url.searchParams.get("atractivoId");
    const rows = CATALOGO.filter((c) => c.natural && (!only || c.id === only));
    return HttpResponse.json({
      periodo: url.searchParams.get("periodo") ?? isoDay(0).slice(0, 7),
      indicadores: rows.map((c) => ({
        atractivo_ref: c.id,
        etiqueta_atractivo: c.nombre["es-CO"],
        ocupacion_estimada_consolidada: { promedio: Math.round(c.ocupacion * 0.8), maximo: Math.round(c.ocupacion) },
        alertas_del_periodo: { preventivas: c.ocupacion >= 85 ? 6 : c.ocupacion >= 60 ? 1 : 0, criticas: c.ocupacion >= 90 ? 3 : 0 },
        distribucion_flujo_turistico: FLUJO,
        nivel_agregacion: "DIARIO",
      })),
    });
  }),
  http.put(gw("/ambiental/retencion"), async ({ request }) => {
    const denied = allow(request, ADMIN_ROLES);
    if (denied) return denied;
    const { periodo_retencion_meses } = (await request.json()) as { periodo_retencion_meses: number };
    if (!(periodo_retencion_meses >= 6)) return HttpResponse.json(errorBody(request, "VALIDACION", "La retención mínima es de 6 meses", [{ campo: "periodo_retencion_meses", problema: "debe ser mayor o igual a 6" }]), { status: 400 });
    return HttpResponse.json({ periodo_retencion_meses });
  }),

  // ── M9 · reportes ────────────────────────────────────────────────────────────────────────────
  http.get(gw("/reportes/indicadores-demanda"), ({ request }) => {
    const denied = allow(request, ANALITICA);
    if (denied) return denied;
    const url = new URL(request.url);
    const top = Number(url.searchParams.get("topN") ?? 5);
    const compare = url.searchParams.get("compararCon");
    return HttpResponse.json({
      periodo: url.searchParams.get("periodo") ?? "2026-Q3",
      comparado_con: compare,
      alcance: claimsOf(request)?.rol === "PRESTADOR" ? "PROPIO" : "GLOBAL",
      atractivos_mas_consultados: [...CATALOGO].sort((a, b) => b.popularidad - a.popularidad).slice(0, top).map((c, i) => ({ referencia: c.id, etiqueta: c.nombre["es-CO"], valor: 1800 - i * 210, variacion: compare ? `${i % 2 ? "-" : "+"}${(i * 1.7 + 2.1).toFixed(1)}%` : null })),
      actividades_mas_reservadas: CATALOGO.filter((c) => c.tipo !== "atractivo").slice(0, top).map((c, i) => ({ referencia: c.id, etiqueta: c.nombre["es-CO"], valor: 420 - i * 80, variacion: compare ? `+${(i + 1.4).toFixed(1)}%` : null })),
      periodos_alta_demanda: [{ periodo: "Semana Santa", valor: 940 }, { periodo: "Vacaciones de mitad de año", valor: 870 }, { periodo: "Diciembre", valor: 1210 }],
      moneda: "COP",
      zona_horaria_presentacion: "America/Bogota",
    });
  }),
  http.get(gw("/reportes/tasa-ocupacion"), ({ request }) => {
    const denied = allow(request, ANALITICA);
    if (denied) return denied;
    const url = new URL(request.url);
    return HttpResponse.json({
      prestador_ref: url.searchParams.get("prestador") ?? claimsOf(request)?.prestador_ref ?? null,
      etiqueta_prestador: "Aventuras Sierra Mar",
      periodo: url.searchParams.get("periodo") ?? "2026-09",
      base_reservas_confirmadas_pasadas: 312,
      tasa_ocupacion: 68.4,
      comparativa: url.searchParams.get("compararCon") ? { periodo: url.searchParams.get("compararCon"), tasa_ocupacion: 62.8, variacion: "+5.6 puntos" } : null,
    });
  }),
  http.get(gw("/reportes/dashboard/series"), ({ request }) => {
    const denied = allow(request, ANALITICA);
    if (denied) return denied;
    const q = new URL(request.url).searchParams;
    const tipo = q.get("tipo") ?? "BARRAS";
    return HttpResponse.json({
      tipo,
      indicador: q.get("indicador") ?? "atractivos_consultados",
      periodo: q.get("periodo") ?? "2026-Q3",
      moneda: "COP",
      puntos:
        tipo === "LINEA_TENDENCIA"
          ? Array.from({ length: 12 }, (_, i) => ({ periodo: isoDay(-7 * (11 - i)), valor: 40 + ((i * 13) % 35) + i * 3 }))
          : CATALOGO.slice(0, Number(q.get("topN") ?? 6)).map((c, i) => ({ etiqueta: c.nombre["es-CO"], valor: 1800 - i * 220 })),
      mensaje: null,
    });
  }),
  http.get(gw("/reportes/dashboard/mapa-calor"), ({ request }) => {
    const denied = allow(request, ANALITICA);
    if (denied) return denied;
    const subs = ["06-10", "10-14", "14-18", "18-22"];
    return HttpResponse.json({
      periodo: new URL(request.url).searchParams.get("periodo") ?? "2026-Q3",
      zona_horaria: "America/Bogota",
      celdas: CATALOGO.filter((c) => c.tipo === "atractivo").flatMap((c, i) => subs.map((s, j) => ({ atractivo_ref: c.id, etiqueta: c.nombre["es-CO"], subperiodo: s, intensidad: Math.round(Math.min(1, Math.max(0.05, (c.ocupacion / 100) * (0.6 + ((i + j) % 4) * 0.2))) * 100) / 100 }))),
    });
  }),
  http.get(gw("/reportes/dashboard/sostenibilidad/atractivos/:id"), ({ request, params }) => {
    const denied = allow(request, AMBIENTAL_READ);
    if (denied) return denied;
    const c = CATALOGO.find((x) => x.id === params.id);
    return HttpResponse.json({ periodo: "2026-Q3", zona_horaria: "America/Bogota", indicadores: c ? [{ atractivo_ref: c.id, etiqueta_atractivo: c.nombre["es-CO"], ocupacion_estimada_consolidada: { promedio: Math.round(c.ocupacion * 0.8), maximo: Math.round(c.ocupacion) }, alertas_del_periodo: { preventivas: 2, criticas: c.ocupacion >= 90 ? 3 : 0 }, distribucion_flujo_turistico: FLUJO, nivel_agregacion: "DIARIO" }] : [] });
  }),
  http.get(gw("/reportes/dashboard/sostenibilidad"), ({ request }) => {
    const denied = allow(request, AMBIENTAL_READ);
    if (denied) return denied;
    return HttpResponse.json({
      periodo: new URL(request.url).searchParams.get("periodo") ?? "2026-Q3",
      zona_horaria: "America/Bogota",
      indicadores: CATALOGO.filter((c) => c.natural).map((c) => ({
        atractivo_ref: c.id,
        etiqueta_atractivo: c.nombre["es-CO"],
        ocupacion_estimada_consolidada: { promedio: Math.round(c.ocupacion * 0.8), maximo: Math.round(c.ocupacion) },
        alertas_del_periodo: { preventivas: c.ocupacion >= 85 ? 6 : c.ocupacion >= 60 ? 1 : 0, criticas: c.ocupacion >= 90 ? 3 : 0 },
        distribucion_flujo_turistico: FLUJO,
        nivel_agregacion: "DIARIO",
      })),
    });
  }),
  http.post(gw("/reportes/exportaciones"), async ({ request }) => {
    const denied = allow(request, ANALITICA);
    if (denied) return denied;
    const body = (await request.json()) as { formato: "PDF" | "CSV"; filtros?: { periodo?: string } };
    const id = crypto.randomUUID();
    jobs.set(id, { formato: body.formato, creado: Date.now(), owner: claimsOf(request)!.sub, falla: body.filtros?.periodo === "2020-Q1" });
    return HttpResponse.json({ job_id: id, estado: "ENCOLADO", formato: body.formato, fecha_solicitud: new Date().toISOString() }, { status: 202 });
  }),
  http.get(gw("/reportes/exportaciones/:id/descarga"), ({ request, params }) => {
    const denied = allow(request, ANALITICA);
    if (denied) return denied;
    const j = jobs.get(String(params.id));
    if (!j || jobState(j) !== "DISPONIBLE") return HttpResponse.json(errorBody(request, "NO_DISPONIBLE", "El archivo aún no está disponible"), { status: 409 });
    if (j.formato === "CSV") return new HttpResponse("atractivo,consultas\nTayrona,1800\nMarinka,1590\n", { headers: { "content-type": "text/csv", "content-disposition": 'attachment; filename="reporte.csv"' } });
    return new HttpResponse(tinyPdf("VITASMARTA - Reporte"), { headers: { "content-type": "application/pdf", "content-disposition": 'attachment; filename="reporte.pdf"' } });
  }),
  http.get(gw("/reportes/exportaciones/:id"), ({ request, params }) => {
    const denied = allow(request, ANALITICA);
    if (denied) return denied;
    const j = jobs.get(String(params.id));
    if (!j) return HttpResponse.json(errorBody(request, "NO_ENCONTRADO", "Exportación no encontrada"), { status: 404 });
    const estado = jobState(j);
    return HttpResponse.json({ job_id: params.id, estado, formato: j.formato, url_descarga: estado === "DISPONIBLE" ? `/api/v1/reportes/exportaciones/${params.id}/descarga` : null, fecha_expiracion: new Date(j.creado + 3 * 86_400_000).toISOString() });
  }),
  http.get(gw("/reportes/admin/pipeline/estado"), ({ request }) =>
    allow(request, ADMIN_ROLES) ?? HttpResponse.json({ lag_consume_segundos: 4.2, mensajes_pendientes: 17, ultimo_replay: new Date(Date.now() - 2 * 86_400_000).toISOString(), colas: [{ nombre: "reservas.eventos", pendientes: 9 }, { nombre: "ambiental.eventos", pendientes: 8 }] }),
  ),
  http.post(gw("/reportes/admin/pipeline/replay"), ({ request }) => allow(request, ADMIN_ROLES) ?? HttpResponse.json({ replay_id: crypto.randomUUID(), estado: "EN_CURSO", eventos_estimados: 1840 }, { status: 202 })),
];

void nombre;
