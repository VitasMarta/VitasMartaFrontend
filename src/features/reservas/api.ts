"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api } from "@/core/api/gatewayClient";
import { IntentKeyCache, requestReservaKey, type OperacionReserva } from "@/core/api/idempotency";
import { routes } from "@/core/api/routes";
import type { CrearReservaEntrada, OfertasRespuesta, PageResponse, ReservaRespuesta } from "@/core/api/types";
import { useSessionStore } from "@/core/auth/sessionStore";
import { useRef } from "react";

/**
 * Franjas reservables de un servicio (M3 `GET /reservas/ofertas/{servicio_ref}`): cupos vivos,
 * tarifa y la política vigente que hay que aceptar. Es la fuente de verdad para reservar
 * (M2 no proyecta franjas ni precios). Requiere sesión: solo se consulta autenticado.
 */
export const useOfertasReserva = (servicioRef: string) => {
  const status = useSessionStore((s) => s.status);
  return useQuery({
    queryKey: ["reservas", "ofertas", servicioRef],
    staleTime: 0,
    refetchOnMount: "always",
    enabled: status === "authenticated" && !!servicioRef,
    queryFn: async () => (await api.get<OfertasRespuesta>(routes.reservas.ofertas(servicioRef))).data,
    refetchInterval: 60_000, // los cupos y las restricciones ambientales cambian en vivo
  });
};

export type ClasificacionReserva = "ACTIVAS" | "PASADAS" | "CANCELADAS";

export const useReservas = (clasificacion: ClasificacionReserva, page: number, size = 20) =>
  useQuery({
    queryKey: ["reservas", "lista", clasificacion, page, size],
    queryFn: async () =>
      (await api.get<PageResponse<ReservaRespuesta>>(routes.reservas.base, { query: { clasificacion, page, size } })).data,
  });

export const useReserva = (ref: string) =>
  useQuery({
    queryKey: ["reservas", "detalle", ref],
    queryFn: async () => (await api.get<ReservaRespuesta>(routes.reservas.detalle(ref))).data,
  });

/**
 * Crear reserva (soft lock). Flujo §3.4:
 *  1. POST /reservas/claves-idempotencia {operacion:"iniciar"}  →  clave emitida por M3.
 *  2. POST /reservas con `Idempotency-Key` y `aceptacion_politica`.
 *  3. Si un corte de red obliga a reintentar, se REUTILIZA la misma clave (misma intención) para
 *     que M3 devuelva la reserva ya creada sin descontar cupos dos veces.
 */
export function useCrearReserva() {
  const queryClient = useQueryClient();
  const keys = useRef(new IntentKeyCache());
  return useMutation({
    meta: { silent: true }, // el panel de reserva muestra el error junto al formulario
    mutationFn: async (input: CrearReservaEntrada) => {
      const fingerprint = `${input.servicio_ref}|${input.franja_ref}|${input.cantidad_cupos}`;
      const key = await keys.current.get(fingerprint, () => requestReservaKey("iniciar", null));
      const correlationId = crypto.randomUUID();
      const { data } = await api.post<ReservaRespuesta>(routes.reservas.base, { body: input, idempotencyKey: key, correlationId });
      keys.current.reset();
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reservas"] }),
  });
}

/** Cancelar / modificar: la clave se pide a M3 con la operación y la referencia de la reserva. */
export function useAccionReserva(operacion: Extract<OperacionReserva, "cancelar" | "modificar">) {
  const queryClient = useQueryClient();
  const keys = useRef(new IntentKeyCache());
  return useMutation({
    mutationFn: async ({ reservaRef, body }: { reservaRef: string; body: { motivo: string } | CrearReservaEntrada }) => {
      const key = await keys.current.get(`${operacion}|${reservaRef}|${JSON.stringify(body)}`, () => requestReservaKey(operacion, reservaRef));
      const { data } = await api.post<ReservaRespuesta>(routes.reservas.accion(reservaRef, operacion), { body, idempotencyKey: key });
      keys.current.reset();
      return data;
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ["reservas"] }),
  });
}

export async function descargarComprobante(reservaRef: string): Promise<void> {
  const { data } = await api.get<Blob>(routes.reservas.comprobante(reservaRef));
  saveBlob(data, `comprobante-${reservaRef}.pdf`);
}

/** Descarga un binario obtenido con Authorization (los enlaces <a href> no enviarían el token). */
export function saveBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}
