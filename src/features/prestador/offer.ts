import type { Localized } from "@/core/api/types";

export type Tipo = "atractivos" | "actividades" | "eventos";
export const TIPOS: Tipo[] = ["atractivos", "actividades", "eventos"];

export interface Contenido {
  id: string;
  tipo?: Tipo;
  estado: string;
  version: number;
  nombre?: Localized;
  [campo: string]: unknown;
}

export interface FieldDef {
  name: string;
  kind?: "text" | "textarea" | "number" | "select" | "datetime-local" | "time" | "checkbox";
  options?: string[];
  required?: boolean;
  min?: number;
  max?: number;
}

const COMMON: FieldDef[] = [
  { name: "nombre_es", required: true },
  { name: "nombre_en", required: true },
  { name: "descripcion_es", kind: "textarea", required: true },
  { name: "descripcion_en", kind: "textarea", required: true },
  { name: "categorias", required: true },
  { name: "lat", kind: "number", required: true },
  { name: "lng", kind: "number", required: true },
];

const EXTRA: Record<Tipo, FieldDef[]> = {
  // Contrato M4 (`AtractivoCreacionSchema`): tarifas[{concepto, precio}], horarios[{dia_semana, hora_inicio,
  // hora_fin}], condiciones_acceso {es,en}, accesibilidad {clave: bool}, sostenibilidad {criterios, certificaciones}.
  atractivos: [
    { name: "tarifa_concepto_es" },
    { name: "tarifa_monto", kind: "number", min: 0 },
    { name: "hora_apertura", kind: "time" },
    { name: "hora_cierre", kind: "time" },
    { name: "condiciones_acceso_es", kind: "textarea" },
    { name: "condiciones_acceso_en", kind: "textarea" },
    { name: "acc_movilidad_reducida", kind: "checkbox" },
    { name: "acc_rampa", kind: "checkbox" },
    { name: "acc_banio_adaptado", kind: "checkbox" },
    { name: "certificaciones" },
  ],
  actividades: [
    { name: "duracion_minutos", kind: "number", required: true, min: 1, max: 1440 },
    { name: "nivel_dificultad", kind: "select", options: ["baja", "media", "alta"], required: true },
    { name: "equipamiento" },
    { name: "operador_nombre", required: true },
    { name: "operador_descripcion" },
    { name: "operador_sitio_web" },
    { name: "precio_monto", kind: "number", required: true, min: 0 },
    { name: "edad_minima", kind: "number", min: 0 },
    { name: "capacidad_maxima", kind: "number", min: 1 },
    { name: "incluye" },
  ],
  eventos: [
    { name: "fecha_inicio", kind: "datetime-local", required: true },
    { name: "fecha_fin", kind: "datetime-local", required: true },
    { name: "cupo_total", kind: "number", required: true, min: 1 },
    { name: "precio_monto", kind: "number", min: 0 },
    { name: "requisitos", kind: "textarea" },
    { name: "organizador_es", required: true },
    { name: "organizador_en" },
    { name: "modalidad", kind: "select", options: ["presencial", "virtual", "hibrido"], required: true },
  ],
};

export const fieldsFor = (tipo: Tipo): FieldDef[] => [...COMMON, ...EXTRA[tipo]];

const pair = (v: unknown): { es: string; en: string } => {
  const o = (v ?? {}) as Record<string, string>;
  return { es: o.es ?? o["es-CO"] ?? "", en: o.en ?? o["en-US"] ?? "" };
};
const list = (v: unknown) => (Array.isArray(v) ? v.join(", ") : v == null ? "" : String(v));
const str = (v: unknown) => (v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v));
const toLocalInput = (iso: unknown) => (typeof iso === "string" && iso ? iso.slice(0, 16) : "");

/** Contenido de M4 → valores planos del formulario. */
export function toFormValues(tipo: Tipo, c: Contenido | undefined): Record<string, string> {
  if (!c) return {};
  const nombre = pair(c.nombre);
  const desc = pair(c.descripcion);
  const base: Record<string, string> = {
    nombre_es: nombre.es,
    nombre_en: nombre.en,
    descripcion_es: desc.es,
    descripcion_en: desc.en,
    categorias: list(c.categorias),
    lat: str((c.ubicacion as { lat?: number } | undefined)?.lat),
    lng: str((c.ubicacion as { lng?: number } | undefined)?.lng),
  };
  if (tipo === "atractivos") {
    const tarifa = (Array.isArray(c.tarifas) ? c.tarifas[0] : undefined) as { concepto?: unknown; precio?: { monto?: unknown } } | undefined;
    const horario = (Array.isArray(c.horarios) ? c.horarios[0] : undefined) as { hora_inicio?: string; hora_fin?: string } | undefined;
    const cond = pair(c.condiciones_acceso);
    const acc = (c.accesibilidad ?? {}) as Record<string, unknown>;
    const sos = (c.sostenibilidad ?? {}) as { certificaciones?: unknown };
    Object.assign(base, {
      tarifa_concepto_es: tarifa ? pair(tarifa.concepto).es : "",
      tarifa_monto: tarifa?.precio?.monto != null ? String(Number(tarifa.precio.monto)) : "",
      hora_apertura: horario?.hora_inicio ?? "",
      hora_cierre: horario?.hora_fin ?? "",
      condiciones_acceso_es: cond.es,
      condiciones_acceso_en: cond.en,
      acc_movilidad_reducida: acc.movilidad_reducida ? "true" : "",
      acc_rampa: acc.rampa ? "true" : "",
      acc_banio_adaptado: acc.banio_adaptado ? "true" : "",
      certificaciones: list(sos.certificaciones),
    });
  } else if (tipo === "actividades") {
    const op = (c.operador ?? {}) as Record<string, string>;
    Object.assign(base, {
      duracion_minutos: str(c.duracion_minutos), nivel_dificultad: str(c.nivel_dificultad), equipamiento: list(c.equipamiento),
      operador_nombre: op.nombre ?? "", operador_descripcion: op.descripcion ?? "", operador_sitio_web: op.sitio_web ?? "",
      precio_monto: str((c.precio as { monto?: number } | undefined)?.monto), edad_minima: str(c.edad_minima), capacidad_maxima: str(c.capacidad_maxima), incluye: list(c.incluye),
    });
  } else {
    const org = pair((c.organizador as { nombre?: unknown } | undefined)?.nombre);
    Object.assign(base, {
      fecha_inicio: toLocalInput(c.fecha_inicio), fecha_fin: toLocalInput(c.fecha_fin), cupo_total: str(c.cupo_total),
      precio_monto: str((c.precio as { monto?: number } | undefined)?.monto), requisitos: str(c.requisitos),
      organizador_es: org.es, organizador_en: org.en, modalidad: str(c.modalidad),
    });
  }
  return base;
}

const csv = (s: string) => s.split(",").map((x) => x.trim()).filter(Boolean);
const num = (s: string) => (s === "" ? undefined : Number(s));

/**
 * Valores del formulario → cuerpo de M4. Regla del contrato: el `operador` de una actividad NO
 * incluye correo ni teléfono (si no, M4 responde `dato_comercial_sensible`).
 */
export function toBody(tipo: Tipo, v: Record<string, string>): Record<string, unknown> {
  const body: Record<string, unknown> = {
    nombre: { es: v.nombre_es, en: v.nombre_en },
    descripcion: { es: v.descripcion_es, en: v.descripcion_en },
    categorias: csv(v.categorias ?? ""),
    ubicacion: { lat: num(v.lat ?? ""), lng: num(v.lng ?? "") },
  };
  if (tipo === "atractivos") {
    const monto = num(v.tarifa_monto ?? "");
    const concepto = (v.tarifa_concepto_es ?? "").trim() || "Entrada general";
    const certs = csv(v.certificaciones ?? "");
    const acc = { movilidad_reducida: v.acc_movilidad_reducida === "true", rampa: v.acc_rampa === "true", banio_adaptado: v.acc_banio_adaptado === "true" };
    Object.assign(body, {
      // M3 toma el precio de la oferta de esta tarifa: sin ella la franja no tiene importe.
      tarifas: monto != null ? [{ concepto: { es: concepto, en: concepto }, precio: { monto: monto.toFixed(2), moneda: "COP" } }] : undefined,
      horarios: v.hora_apertura && v.hora_cierre ? [0, 1, 2, 3, 4, 5, 6].map((dia_semana) => ({ dia_semana, hora_inicio: v.hora_apertura, hora_fin: v.hora_cierre })) : undefined,
      condiciones_acceso: v.condiciones_acceso_es ? { es: v.condiciones_acceso_es, ...(v.condiciones_acceso_en ? { en: v.condiciones_acceso_en } : {}) } : undefined,
      accesibilidad: Object.values(acc).some(Boolean) ? acc : undefined,
      sostenibilidad: certs.length ? { criterios: {}, certificaciones: certs } : undefined,
    });
  } else if (tipo === "actividades") {
    Object.assign(body, {
      duracion_minutos: num(v.duracion_minutos ?? ""), nivel_dificultad: v.nivel_dificultad, equipamiento: csv(v.equipamiento ?? ""),
      operador: { nombre: v.operador_nombre, descripcion: v.operador_descripcion || undefined, sitio_web: v.operador_sitio_web || undefined },
      precio: { monto: num(v.precio_monto ?? ""), moneda: "COP" }, edad_minima: num(v.edad_minima ?? ""), capacidad_maxima: num(v.capacidad_maxima ?? ""), incluye: csv(v.incluye ?? ""),
    });
  } else {
    Object.assign(body, {
      fecha_inicio: v.fecha_inicio ? new Date(v.fecha_inicio).toISOString() : undefined, fecha_fin: v.fecha_fin ? new Date(v.fecha_fin).toISOString() : undefined,
      cupo_total: num(v.cupo_total ?? ""), precio: v.precio_monto ? { monto: num(v.precio_monto), moneda: "COP" } : undefined, requisitos: v.requisitos || undefined,
      organizador: { nombre: { es: v.organizador_es, en: v.organizador_en || v.organizador_es } }, modalidad: v.modalidad,
    });
  }
  return body;
}

export const ESTADOS_EDITABLES = ["borrador", "devuelto"];
