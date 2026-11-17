import { useTranslations } from "next-intl";
import type { PoliticaOferta } from "@/core/api/types";
import type { Tone } from "@/shared/ui/indicators";
import { StatusTag } from "@/shared/ui/indicators";

/** Estados de M3 (`EstadoReserva`) y de M4 (los mismos en minúscula: `pendiente_confirmacion`…). */
const TONES: Record<string, Tone> = {
  CONFIRMADA: "good",
  COMPLETADA: "good",
  CHECK_IN: "good",
  SOLICITADA: "warn",
  PENDIENTE_PAGO_EXTERNO: "warn",
  PENDIENTE_CONFIRMACION_PRESTADOR: "warn",
  PENDIENTE_CONFIRMACION: "warn",
  PENDIENTE: "warn",
  CANCELADA: "bad",
  RECHAZADA: "bad",
  EXPIRADA: "bad",
  MODIFICADA: "neutral",
};

/** Estado de reserva con punto + texto (no solo color). Los estados desconocidos se muestran tal cual. */
export function ReservaStatus({ estado }: { estado: string }) {
  const t = useTranslations("reservas.states");
  const clave = estado.toUpperCase();
  return <StatusTag tone={TONES[clave] ?? "neutral"}>{t.has(clave) ? t(clave) : estado}</StatusTag>;
}

/**
 * Texto de la política vigente de una oferta de M3: su contenido y, si vienen, el plazo de
 * cancelación sin costo y la penalidad.
 */
export function PoliticaOfertaTexto({ politica, className }: { politica: PoliticaOferta; className?: string }) {
  const t = useTranslations("reservas.booking");
  const horas = politica.horas_limite_cancelacion;
  const pct = politica.penalidad_porcentaje;
  return (
    <div className={className}>
      {politica.contenido && <p>{politica.contenido}</p>}
      {horas != null && pct != null && <p className={politica.contenido ? "mt-1" : undefined}>{t("policyTerms", { horas, pct })}</p>}
      {!politica.contenido && (horas == null || pct == null) && <p>{t("policyRef", { version: politica.version })}</p>}
    </div>
  );
}

/**
 * M3 devuelve `siguiente_accion` como código (ESPERAR_CONFIRMACION, CONTACTAR_PRESTADOR…).
 * Se traduce; si no es un código conocido (p. ej. una frase de los mocks), se muestra tal cual.
 */
export function textoSiguienteAccion(
  t: { has: (k: string) => boolean; (k: string): string },
  accion: string | null | undefined,
): string | undefined {
  if (!accion) return undefined;
  return t.has(`nextAction.${accion}`) ? t(`nextAction.${accion}`) : /^[A-Z_]+$/.test(accion) ? undefined : accion;
}

export const isPending = (estado: string) => estado.toUpperCase().startsWith("PENDIENTE") || estado.toUpperCase() === "SOLICITADA";
export const isFinal = (estado: string) => ["CANCELADA", "RECHAZADA", "MODIFICADA", "EXPIRADA", "COMPLETADA"].includes(estado.toUpperCase());
