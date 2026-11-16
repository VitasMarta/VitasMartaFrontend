import { useTranslations } from "next-intl";
import type { Tone } from "@/shared/ui/indicators";
import { StatusTag } from "@/shared/ui/indicators";

const TONES: Record<string, Tone> = {
  CONFIRMADA: "good",
  CHECK_IN: "good",
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
  return <StatusTag tone={TONES[estado] ?? "neutral"}>{t.has(estado) ? t(estado) : estado}</StatusTag>;
}

export const isPending = (estado: string) => estado.startsWith("PENDIENTE");
export const isFinal = (estado: string) => ["CANCELADA", "RECHAZADA", "MODIFICADA", "EXPIRADA"].includes(estado);
