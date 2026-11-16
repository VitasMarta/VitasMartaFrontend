"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/gatewayClient";
import { newClientKey } from "@/core/api/idempotency";
import { routes } from "@/core/api/routes";
import { toList } from "@/core/api/types";
import type { Contenido, Tipo } from "./offer";

export const PAGE_SIZE = 10;

/**
 * Oferta del prestador. El administrador actúa sobre un prestador con `X-Tenant-Id`: pasar `""`
 * mientras aún no se elige deja la consulta en espera (M4 respondería 400 tenant_requerido).
 */
export const useOferta = (tipo: Tipo, page: number, estado?: string, tenantId?: string) =>
  useQuery({
    queryKey: ["m4", "oferta", tipo, page, estado, tenantId],
    enabled: tenantId !== "",
    queryFn: async () =>
      toList<Contenido>((await api.get(routes.prestadores.oferta(tipo), { query: { page, page_size: PAGE_SIZE, estado }, tenantId })).data),
  });

export const useContenido = (tipo: Tipo, id: string | undefined) =>
  useQuery({
    queryKey: ["m4", "contenido", tipo, id],
    enabled: !!id,
    queryFn: async () => (await api.get<Contenido>(routes.prestadores.ofertaItem(tipo, id!))).data,
  });

/** Crea (POST) o actualiza (PATCH con `version_esperada`) un contenido de M4. */
export function useGuardarContenido(tipo: Tipo, id?: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true }, // el editor muestra el error (conflicto de versión) en su propia franja
    mutationFn: async ({ body, version }: { body: Record<string, unknown>; version?: number }) =>
      id
        ? (await api.patch<Contenido>(routes.prestadores.ofertaItem(tipo, id), { body: { version_esperada: version, ...body } })).data
        : (await api.post<Contenido>(routes.prestadores.oferta(tipo), { body })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["m4"] }),
  });
}

export function useAccionContenido(id: string) {
  const qc = useQueryClient();
  return useMutation({
    meta: { silent: true },
    mutationFn: async ({ accion, motivo, version }: { accion: "enviar-revision" | "corregir"; motivo: string; version: number }) =>
      (await api.post<Contenido>(routes.prestadores.contenido(id, accion), { body: { motivo, version_esperada: version } })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["m4"] }),
  });
}

export const useHistorial = (id: string) =>
  useQuery({
    queryKey: ["m4", "historial", id],
    queryFn: async () => toList<{ estado_origen: string; estado_destino: string; motivo?: string | null; usuario_id?: string; ocurrido_en: string; version_resultante?: number }>((await api.get(routes.prestadores.contenido(id, "historial"), { query: { page: 1, page_size: 20 } })).data),
  });

export interface Multimedia {
  id: string;
  tipo: "foto" | "video";
  url_cdn: string;
  tam_bytes: number;
  mime_type: string;
  orden: number;
}
export const useMultimediaM4 = (id: string) =>
  useQuery({ queryKey: ["m4", "multimedia", id], queryFn: async () => (await api.get<Multimedia[]>(routes.prestadores.contenido(id, "multimedia"))).data });

export function useMultimediaActions(id: string, version: number) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["m4"] });
  return {
    upload: useMutation({
      mutationFn: async ({ archivo, tipo, orden }: { archivo: File; tipo: "foto" | "video"; orden: number }) => {
        const form = new FormData();
        form.append("archivo", archivo);
        form.append("tipo", tipo);
        form.append("orden", String(orden));
        form.append("version_esperada", String(version));
        return (await api.post<Multimedia>(routes.prestadores.contenido(id, "multimedia"), { body: form })).data;
      },
      onSuccess: refresh,
    }),
    reorder: useMutation({
      mutationFn: async (items: { id: string; orden: number }[]) => api.put(routes.prestadores.contenido(id, "multimedia/orden"), { body: { items, version_esperada: version } }),
      onSuccess: refresh,
    }),
    remove: useMutation({
      mutationFn: async (mid: string) => api.delete(routes.prestadores.multimediaItem(id, mid), { query: { version_esperada: version } }),
      onSuccess: refresh,
    }),
  };
}

export interface FranjaM4 {
  id: string;
  fecha: string;
  hora_inicio: string;
  hora_fin: string;
  cupo_total: number;
  cupo_disponible: number;
  estado: string;
  version: number;
}
export const useFranjasM4 = (id: string) =>
  useQuery({ queryKey: ["m4", "franjas", id], queryFn: async () => toList<FranjaM4>((await api.get(routes.prestadores.contenido(id, "franjas"))).data).items });

export function useFranjaActions(contenidoId: string) {
  const qc = useQueryClient();
  const refresh = () => qc.invalidateQueries({ queryKey: ["m4", "franjas", contenidoId] });
  return {
    create: useMutation({
      meta: { silent: true },
      mutationFn: async (f: Omit<FranjaM4, "id" | "version">) => api.post(routes.prestadores.contenido(contenidoId, "franjas"), { body: { franjas: [f] } }),
      onSuccess: refresh,
    }),
    update: useMutation({
      meta: { silent: true },
      mutationFn: async ({ id, version, ...rest }: { id: string; version: number; cupo_total: number; cupo_disponible: number; estado: string }) =>
        api.patch(routes.prestadores.franja(id), { body: { version_esperada: version, ...rest } }),
      onSuccess: refresh,
    }),
    remove: useMutation({ mutationFn: async (id: string) => api.delete(routes.prestadores.franja(id)), onSuccess: refresh }),
  };
}

/**
 * M4 `ReservaRespuesta` (vista del prestador, leída de M3 por el canal interno). Estados en minúscula:
 * pendiente_confirmacion | confirmada | rechazada | cancelada | expirada. `total` es decimal en texto.
 */
export interface ReservaM4 {
  id: string;
  estado: string;
  fecha_creacion: string;
  contenido_id?: string | null;
  total?: string | number | null;
  version: number;
  actualizado_en?: string | null;
}
export const useReservasRecibidas = (page: number, estado?: string) =>
  useQuery({
    queryKey: ["m4", "reservas", page, estado],
    queryFn: async () => toList<ReservaM4>((await api.get(routes.prestadores.reservas, { query: { page, page_size: PAGE_SIZE, estado } })).data),
  });

/** confirmar / rechazar / cancelar con `Idempotency-Key` (UUID v4 del cliente en M4) y `motivo`. */
export function useAccionReservaM4() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, accion, motivo, key }: { id: string; accion: "confirmar" | "rechazar" | "cancelar"; motivo: string; key: string }) =>
      (await api.post(routes.prestadores.reservaAccion(id, accion), { body: { motivo }, idempotencyKey: key })).data,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["m4", "reservas"] }),
  });
}

export interface IndicadoresM4 {
  tenant_id: string;
  desde: string;
  hasta: string;
  indicadores: { reservas_total: number; reservas_confirmadas: number; reservas_canceladas: number; ingresos_cop: number; ocupacion_promedio_porcentaje: number; contenidos_publicados: number };
  series: { periodo: string; reservas: number; ingresos_cop: number }[];
}
export const useIndicadoresM4 = (desde: string, hasta: string, contenidoId?: string) =>
  useQuery({
    queryKey: ["m4", "indicadores", desde, hasta, contenidoId],
    queryFn: async () => (await api.get<IndicadoresM4>(routes.prestadores.indicadores, { query: { desde, hasta, contenido_id: contenidoId } })).data,
  });

export { newClientKey };
