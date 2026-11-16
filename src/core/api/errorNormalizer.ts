/**
 * Normaliza las dos familias de error del Gateway (contrato §1.3):
 *  1. Envoltura VITASMARTA (M1, M3, M6, M7, M8, M9): { codigo, mensaje, marca_temporal, correlation_id, detalles[] }
 *  2. Problem Details RFC 7807 (solo M4): { type, title, status, detail, instance, code, trace_id }
 * El mensaje visible sale de `error.mensaje || error.detail`.
 */
export interface FieldProblem {
  campo: string;
  problema: string;
}

export class ApiError extends Error {
  readonly status: number;
  readonly codigo: string;
  readonly correlationId?: string;
  readonly detalles: FieldProblem[];
  readonly raw: unknown;

  constructor(init: {
    status: number;
    codigo: string;
    mensaje: string;
    correlationId?: string;
    detalles?: FieldProblem[];
    raw?: unknown;
  }) {
    super(init.mensaje);
    this.name = "ApiError";
    this.status = init.status;
    this.codigo = init.codigo;
    this.correlationId = init.correlationId;
    this.detalles = init.detalles ?? [];
    this.raw = init.raw;
  }

  /** Errores de red / Gateway caído: se degradan, no rompen la pantalla. */
  get isUnavailable(): boolean {
    return this.status === 0 || this.status === 503 || this.codigo === "SERVICIO_NO_DISPONIBLE";
  }

  /** Solo M4 (RFC 7807): conflicto de versionado optimista. */
  get isVersionConflict(): boolean {
    return this.status === 409 && this.codigo === "version_conflict";
  }

  /** Mapa campo → mensaje para pintar errores junto a cada control del formulario. */
  fieldErrors(): Record<string, string> {
    return Object.fromEntries(this.detalles.map((d) => [d.campo, d.problema]));
  }
}

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

const asString = (v: unknown): string | undefined => (typeof v === "string" && v ? v : undefined);

export function normalizeError(status: number, body: unknown, fallbackCorrelationId?: string): ApiError {
  if (isRecord(body)) {
    // RFC 7807 (M4): se reconoce por `detail`/`title` + `code`/`type`
    const isProblem = "detail" in body || "title" in body || "type" in body;
    if (isProblem && !("mensaje" in body)) {
      return new ApiError({
        status: typeof body.status === "number" ? body.status : status,
        codigo: asString(body.code) ?? asString(body.title) ?? `HTTP_${status}`,
        mensaje: asString(body.detail) ?? asString(body.title) ?? defaultMessage(status),
        correlationId: asString(body.trace_id) ?? fallbackCorrelationId,
        raw: body,
      });
    }

    const detalles = Array.isArray(body.detalles)
      ? body.detalles
          .filter(isRecord)
          .map((d) => ({ campo: asString(d.campo) ?? "", problema: asString(d.problema) ?? "" }))
          .filter((d) => d.campo || d.problema)
      : [];

    return new ApiError({
      status,
      codigo: asString(body.codigo) ?? `HTTP_${status}`,
      mensaje: asString(body.mensaje) ?? asString(body.detail) ?? defaultMessage(status),
      correlationId: asString(body.correlation_id) ?? fallbackCorrelationId,
      detalles,
      raw: body,
    });
  }

  return new ApiError({
    status,
    codigo: `HTTP_${status}`,
    mensaje: defaultMessage(status),
    correlationId: fallbackCorrelationId,
    raw: body,
  });
}

export function networkError(correlationId?: string): ApiError {
  return new ApiError({
    status: 0,
    codigo: "RED",
    mensaje: "No fue posible conectar con el servicio",
    correlationId,
  });
}

function defaultMessage(status: number): string {
  if (status === 401) return "Tu sesión no es válida o expiró";
  if (status === 403) return "No tienes permiso para realizar esta acción";
  if (status === 404) return "No encontramos lo que buscas";
  if (status === 429) return "Demasiadas solicitudes, intenta de nuevo en un momento";
  if (status >= 500) return "El servicio no está disponible en este momento";
  return "No fue posible completar la solicitud";
}
