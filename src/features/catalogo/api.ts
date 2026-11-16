"use client";

import { useInfiniteQuery, useQuery } from "@tanstack/react-query";
import { ApiError } from "@/core/api/errorNormalizer";
import { api } from "@/core/api/gatewayClient";
import { routes } from "@/core/api/routes";
import type {
  AlternativasRespuesta,
  BuenasPracticas,
  CategoriaDTO,
  FichaCatalogo,
  MultimediaDTO,
  NivelSaturacion,
  RecomendacionesRespuesta,
  RespuestaFranjas,
  ResultadoBusqueda,
} from "@/core/api/types";
import { useSessionStore } from "@/core/auth/sessionStore";

export interface BusquedaFiltros {
  texto?: string;
  categorias?: string[];
  precio_minimo?: number;
  precio_maximo?: number;
  orden?: "relevancia" | "nombre" | "distancia" | "precio" | "popularidad" | "sostenibilidad";
  descendente?: boolean;
  lat?: number;
  lng?: number;
  radio_km?: number;
}

/** M2 es público (RF-01-7): se llama sin token para no disparar refrescos innecesarios. */
export const useCategorias = () =>
  useQuery({
    queryKey: ["catalogo", "categorias"],
    queryFn: async () => (await api.get<CategoriaDTO[]>(routes.catalogo.categorias, { auth: false })).data,
    staleTime: 10 * 60_000,
  });

/** Paginación por cursor (`cursor_siguiente`). Cambiar `orden` conserva el resto de filtros (RF-01-6). */
export const useBusqueda = (filtros: BusquedaFiltros, limite = 20) =>
  useInfiniteQuery({
    queryKey: ["catalogo", "busqueda", filtros, limite],
    initialPageParam: undefined as string | undefined,
    queryFn: async ({ pageParam }) =>
      (
        await api.get<ResultadoBusqueda>(routes.catalogo.busqueda, {
          auth: false,
          query: { ...filtros, limite, cursor: pageParam },
        })
      ).data,
    getNextPageParam: (last) => last.cursor_siguiente ?? undefined,
  });

export const useFicha = (id: string) =>
  useQuery({
    queryKey: ["catalogo", "ficha", id],
    queryFn: async () => (await api.get<FichaCatalogo>(routes.catalogo.ficha(id), { auth: false })).data,
  });

export const useFranjas = (id: string) =>
  useQuery({
    queryKey: ["catalogo", "franjas", id],
    queryFn: async () => (await api.get<RespuestaFranjas>(routes.catalogo.franjas(id), { auth: false })).data,
  });

export const useMultimedia = (id: string) =>
  useQuery({
    queryKey: ["catalogo", "multimedia", id],
    queryFn: async () =>
      [...(await api.get<MultimediaDTO[]>(routes.catalogo.multimedia(id), { auth: false })).data].sort((a, b) => a.orden - b.orden),
  });

/**
 * M8 · Buenas prácticas (CTR-M8-OUT-06). `200` → contenido; `204` → `null` (la sección se OMITE sin error);
 * M8 caído (503/red) → `null` (degradación silenciosa, CTR-M1-OUT-06 regla 1).
 */
export const useBuenasPracticas = (id: string) =>
  useQuery({
    queryKey: ["ambiental", "buenas-practicas", id],
    queryFn: async (): Promise<BuenasPracticas | null> => {
      try {
        const r = await api.get<BuenasPracticas>(routes.ambiental.buenasPracticas(id), { auth: false });
        return r.status === 204 || !r.data ? null : r.data;
      } catch (error) {
        if (error instanceof ApiError) return null;
        throw error;
      }
    },
    retry: false,
  });

export type Recomendaciones = RecomendacionesRespuesta & { httpStatus: number };

/** Respuesta real de M6 (`RespuestaRecomendaciones`). */
interface RecomendacionesM6 {
  modo?: string;
  estrategia_usada?: string;
  degradada_fallback?: boolean;
  personalizada?: boolean;
  metadatos_ia?: { aviso_transparencia?: string };
  recomendaciones?: {
    atractivo_id: string; nombre: string; categorias?: string[]; puntuacion_afinidad?: number; explicacion?: string;
    es_alternativa_sostenible?: boolean; nivel_saturacion?: string; ocupacion_estimada?: number | null;
  }[];
  generado_en?: string;
}

/** Adapta M6 a la vista: `recomendaciones[]` → `items[]` con el bloque de sostenibilidad de la banda. */
export function adaptarRecomendaciones(d: RecomendacionesM6 & Partial<RecomendacionesRespuesta>, correlationId = ""): RecomendacionesRespuesta {
  if (Array.isArray(d.items)) return d as RecomendacionesRespuesta; // ya en la forma de la vista (mocks)
  const degradada = !!d.degradada_fallback;
  return {
    estado_respuesta: d.personalizada ? "PERSONALIZADA" : degradada ? "DEGRADADA_FALLBACK" : "ESTANDAR_SIN_PERFILADO",
    degradada,
    aviso_transparencia_ia: d.metadatos_ia?.aviso_transparencia ?? "",
    marca_temporal: d.generado_en ?? new Date().toISOString(),
    correlation_id: correlationId,
    items: (d.recomendaciones ?? []).map((r) => ({
      atractivo_ref: r.atractivo_id,
      nombre: r.nombre,
      categorias: r.categorias ?? [],
      puntuacion: r.puntuacion_afinidad ?? 0,
      explicacion: r.explicacion ?? "",
      sostenibilidad: {
        ocupacion_estimada: r.ocupacion_estimada ?? 0,
        nivel_saturacion: (r.nivel_saturacion ?? "NOMINAL") as NivelSaturacion,
        es_alternativa_sostenible: !!r.es_alternativa_sostenible,
      },
    })),
  };
}

/**
 * M6 · Recomendaciones (solo TURISTA con JWT). `206` = fallback degradado (se muestra normal con una
 * etiqueta sutil). Cualquier error de M6 → `null`: la sección se oculta sin romper la página.
 */
export const useRecomendaciones = (limite = 5) => {
  const rol = useSessionStore((s) => s.user?.rol);
  return useQuery({
    queryKey: ["recomendaciones", limite],
    enabled: rol === "TURISTA",
    retry: false,
    queryFn: async (): Promise<Recomendaciones | null> => {
      try {
        const r = await api.get<RecomendacionesM6 & Partial<RecomendacionesRespuesta>>(routes.recomendaciones.base, { query: { limite } });
        return { ...adaptarRecomendaciones(r.data), httpStatus: r.status };
      } catch (error) {
        if (error instanceof ApiError) return null;
        throw error;
      }
    },
  });
};

/** CU-13: alternativas descongestivas cuando el destino supera el 80 % o M3 responde 409 RESERVA_RESTRINGIDA. */
export const useAlternativas = (atractivoId: string, enabled: boolean) =>
  useQuery({
    queryKey: ["recomendaciones", "alternativas", atractivoId],
    enabled,
    retry: false,
    queryFn: async (): Promise<AlternativasRespuesta | null> => {
      try {
        return (await api.get<AlternativasRespuesta>(routes.recomendaciones.alternativas(atractivoId), { auth: false })).data;
      } catch (error) {
        if (error instanceof ApiError) return null;
        throw error;
      }
    },
  });
