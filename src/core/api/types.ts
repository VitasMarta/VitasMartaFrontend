/**
 * DTOs derivados de `contratos_de_consumo_api_del_frontend.md`. Donde el contrato no detalla el
 * esquema (marcado "SUPUESTO") los campos son opcionales y la UI renderiza solo lo presente.
 */

/** Texto localizado: `{ "es-CO": "...", "en-US": "..." }` (M2) o `{ es, en }` (M4). */
export type Localized = string | Record<string, string>;

// ── Paginación ────────────────────────────────────────────────────────────────
/** M3 / M7 / M8 (page base 0) */
export interface PageResponse<T> {
  content: T[];
  page: number;
  size: number;
  totalElements?: number;
  total_elements?: number;
}

/** SUPUESTO: M4 devuelve `{ items, total, page, page_size }` (page base 1); se tolera también array / `content`. */
export interface ListResult<T> {
  items: T[];
  total: number;
}

export function toList<T>(data: unknown): ListResult<T> {
  if (Array.isArray(data)) return { items: data as T[], total: data.length };
  if (data && typeof data === "object") {
    const d = data as Record<string, unknown>;
    const items = (d.items ?? d.content ?? d.data ?? d.resultados ?? []) as T[];
    const total = Number(d.total ?? d.totalElements ?? d.total_elements ?? items.length);
    return { items: Array.isArray(items) ? items : [], total };
  }
  return { items: [], total: 0 };
}

// ── M2 · Catálogo ─────────────────────────────────────────────────────────────
export interface CategoriaDTO {
  slug: string;
  nombre: Record<string, string>;
  primer_nivel: boolean;
}

/** SUPUESTO: el contrato no define los campos de `ItemResultadoBusqueda`. */
export interface ItemResultadoBusqueda {
  id: string;
  tipo?: "atractivo" | "actividad" | "evento";
  nombre: Localized;
  descripcion_corta?: Localized;
  categorias?: string[];
  precio?: number | { monto: number; moneda?: string } | null;
  distancia_km?: number | null;
  imagen_url?: string | null;
  sostenibilidad?: { ocupacion_estimada?: number; nivel_saturacion?: NivelSaturacion } | number | null;
}

export interface ResultadoBusqueda {
  items: ItemResultadoBusqueda[];
  total: number;
  cursor_siguiente: string | null;
  desde_cache: boolean;
  frescura_ultima_actualizacion?: string | null;
}

export type NivelSaturacion = "NOMINAL" | "RECOMENDACION" | "PREVENTIVO" | "CRITICO";

/** Ficha dinámica (JSONB): solo se renderiza lo presente. */
export type FichaCatalogo = Record<string, unknown> & {
  id?: string;
  nombre?: Localized;
  descripcion?: Localized;
  categorias?: string[];
  atributos?: Record<string, unknown>;
  /** SUPUESTO: la ficha expone la política de cancelación vigente para aceptarla al reservar. */
  politica_cancelacion?: { politica_ref: string; version: string | number; descripcion?: Localized };
  sostenibilidad?: { ocupacion_estimada?: number; nivel_saturacion?: NivelSaturacion };
  precio?: number | { monto: number; moneda?: string } | null;
};

export interface Franja {
  /** SUPUESTO: identificador de franja usado como `franja_ref` al reservar. */
  franja_ref?: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  cupo: number;
  estado: string;
}
export interface RespuestaFranjas {
  id: string;
  franjas: Franja[];
}

export interface MultimediaDTO {
  tipo: "foto" | "video";
  url_cdn: string;
  tam_bytes: number;
  orden: number;
}

// ── M3 · Reservas ─────────────────────────────────────────────────────────────
export interface CrearReservaEntrada {
  servicio_ref: string;
  franja_ref: string;
  cantidad_cupos: number;
  aceptacion_politica: { aceptada: true; politica_ref: string; version: string | number };
}

export interface ReservaRespuesta {
  reserva_ref: string;
  codigo_confirmacion?: string;
  estado: string;
  fecha_inicio?: string;
  fecha_fin?: string;
  /** Fecha límite del soft lock / confirmación del prestador. */
  vence_en?: string | null;
  tarifa?: { monto: number; moneda?: string } | number | null;
  politica?: { politica_ref?: string; version?: string | number; descripcion?: string } | null;
  instrucciones_pago_externo?: string | null;
  siguiente_accion?: string | null;
  penalidad_aplicada_porcentaje?: number | null;
  original_ref?: string | null;
  reemplazo_ref?: string | null;
  /** SUPUESTO: nombre del servicio reservado, para listados legibles. */
  servicio_nombre?: Localized;
  servicio_ref?: string;
  cantidad_cupos?: number;
}

// ── M6 · Recomendaciones ──────────────────────────────────────────────────────
export interface RecomendacionItem {
  atractivo_ref: string;
  nombre: string;
  categorias: string[];
  puntuacion: number;
  explicacion: string;
  sostenibilidad: { ocupacion_estimada: number; nivel_saturacion: NivelSaturacion; es_alternativa_sostenible: boolean };
}
export interface RecomendacionesRespuesta {
  estado_respuesta: "PERSONALIZADA" | "ESTANDAR_SIN_PERFILADO" | "DEGRADADA_FALLBACK";
  degradada: boolean;
  motivo_degradacion?: string;
  aviso_transparencia_ia: string;
  marca_temporal: string;
  correlation_id: string;
  items: RecomendacionItem[];
}
export interface AlternativasRespuesta {
  atractivo_saturado_ref: string;
  ocupacion_actual_saturado: number;
  mensaje_ambiental: string;
  alternativas: { atractivo_ref: string; nombre: string; categorias: string[]; ocupacion_estimada: number; explicacion: string }[];
}

// ── M7 · Identidad ────────────────────────────────────────────────────────────
export type Finalidad = "TRATAMIENTO" | "COMERCIAL" | "PERFILADO";
export interface ConsentimientoEstado {
  finalidad: Finalidad;
  otorgado: boolean;
  version_terminos?: string;
  fecha?: string;
}
export interface SolicitudArco {
  id: string;
  tipo: "ACCESO" | "RECTIFICACION" | "CANCELACION" | "OPOSICION";
  detalle?: string;
  estado: string;
  /** SUPUESTO: paso actual (1..5) del trámite. */
  paso_actual?: number;
  fecha_solicitud?: string;
}
export interface UsuarioAdmin {
  id: string;
  correo: string;
  rol: string;
  estado?: string;
  bloqueado?: boolean;
  ultimo_acceso?: string;
}
export interface AuditoriaEntrada {
  [campo: string]: unknown;
}

// ── M8 · Ambiental ────────────────────────────────────────────────────────────
export interface BuenasPracticas {
  atractivo_ref: string;
  contenido: string;
  fecha_publicacion: string;
}
export interface ConfiguracionCapacidad {
  capacidad_carga: number;
  umbral_recomendacion: number;
  umbral_preventivo: number;
  umbral_critico: number;
  fuente_criterio?: string;
  vigencia_desde?: string;
  vigencia_hasta?: string;
  responsable?: string;
  version?: number;
  restriccion_reservas?: boolean;
  criterio_vencido?: boolean;
}
export interface AlertaAmbiental {
  id: string;
  atractivo_ref?: string;
  tipo: "PREVENTIVA" | "CRITICA";
  estado: "ACTIVA" | "RECONOCIDA" | "CERRADA";
  ocupacion?: number;
  fecha?: string;
  usuario_responsable?: string;
}
export interface IndicadorAmbiental {
  atractivo_ref: string;
  etiqueta_atractivo?: string;
  ocupacion_estimada_consolidada: { promedio: number; maximo: number };
  alertas_del_periodo: { preventivas: number; criticas: number };
  distribucion_flujo_turistico: Record<string, number>;
  nivel_agregacion?: string;
}

// ── M9 · Reportes ─────────────────────────────────────────────────────────────
export interface ItemRanking {
  referencia: string;
  etiqueta: string;
  valor: number;
  variacion?: string | number | null;
}
export interface IndicadoresDemanda {
  periodo: string;
  comparado_con?: string | null;
  alcance?: string;
  atractivos_mas_consultados: ItemRanking[];
  actividades_mas_reservadas: ItemRanking[];
  periodos_alta_demanda?: { periodo: string; valor: number }[];
  moneda?: string;
  zona_horaria_presentacion?: string;
}
export interface TasaOcupacion {
  prestador_ref?: string;
  etiqueta_prestador?: string;
  periodo: string;
  base_reservas_confirmadas_pasadas?: number;
  tasa_ocupacion: number;
  comparativa?: { periodo: string; tasa_ocupacion: number; variacion: string } | null;
}
export interface SerieDashboard {
  tipo: string;
  indicador: string;
  periodo?: string;
  moneda?: string;
  puntos: { etiqueta?: string; periodo?: string; valor: number }[];
  mensaje?: string;
}
export interface MapaCalor {
  periodo: string;
  zona_horaria?: string;
  celdas: { atractivo_ref: string; etiqueta: string; subperiodo: string; intensidad: number }[];
}
export type EstadoExportacion = "ENCOLADO" | "GENERANDO" | "DISPONIBLE" | "FALLIDO";
export interface JobExportacion {
  job_id: string;
  estado: EstadoExportacion;
  formato?: "PDF" | "CSV";
  fecha_solicitud?: string;
  url_descarga?: string | null;
  fecha_expiracion?: string | null;
}
