import type { ConsentimientoEstado, Finalidad } from "@/core/api/types";

/** M7 (`ConsentimientosResponse`): `{ vigente: { FINALIDAD: { otorgado, version_politica, fecha_hora } }, historial }`. */
export interface ConsentimientosM7 {
  vigente?: Record<string, { finalidad?: Finalidad; otorgado: boolean; version_politica?: string; fecha_hora?: string }>;
}

const FINALIDADES: Finalidad[] = ["TRATAMIENTO", "COMERCIAL", "PERFILADO"];

/** Estado vigente por finalidad (las que no tienen registro se muestran como no otorgadas). */
export function consentimientosVigentes(data: ConsentimientosM7 | ConsentimientoEstado[]): ConsentimientoEstado[] {
  if (Array.isArray(data)) return data;
  const vigente = data.vigente ?? {};
  return FINALIDADES.map((finalidad) => {
    const c = vigente[finalidad];
    return { finalidad, otorgado: !!c?.otorgado, version_terminos: c?.version_politica, fecha: c?.fecha_hora };
  });
}
