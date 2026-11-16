import { describe, expect, it } from "vitest";
import { adaptarRecomendaciones } from "@/features/catalogo/api";
import { consentimientosVigentes } from "@/features/perfil/consentimientos";
import { localDayOf, rangoMensual } from "@/core/format";
import { toBody } from "@/features/prestador/offer";

/**
 * Adaptadores a los contratos REALES de los servicios (verificados en vivo contra el stack). Si un
 * servicio cambia su forma de respuesta, estas pruebas indican qué pantalla dejaría de mostrar datos.
 */
describe("contratos reales · M6 recomendaciones", () => {
  it("convierte `recomendaciones[]` de M6 en los ítems de la banda", () => {
    const r = adaptarRecomendaciones({
      modo: "ESTANDAR",
      estrategia_usada: "FALLBACK_REGLAS",
      degradada_fallback: true,
      personalizada: false,
      metadatos_ia: { aviso_transparencia: "Sugerencias generadas automáticamente." },
      recomendaciones: [
        { atractivo_id: "a1", nombre: "Museo", categorias: ["cultura"], puntuacion_afinidad: 0.8, explicacion: "Por tu interés", es_alternativa_sostenible: true, nivel_saturacion: "CRITICO", ocupacion_estimada: 100 },
      ],
    });
    expect(r.estado_respuesta).toBe("DEGRADADA_FALLBACK");
    expect(r.degradada).toBe(true);
    expect(r.aviso_transparencia_ia).toBe("Sugerencias generadas automáticamente.");
    expect(r.items[0]).toMatchObject({ atractivo_ref: "a1", puntuacion: 0.8, sostenibilidad: { nivel_saturacion: "CRITICO", ocupacion_estimada: 100, es_alternativa_sostenible: true } });
  });

  it("sin recomendaciones devuelve una lista vacía (la banda se oculta)", () => {
    expect(adaptarRecomendaciones({ personalizada: true }).items).toEqual([]);
  });
});

describe("contratos reales · M7 consentimientos", () => {
  it("toma la vista vigente por finalidad y marca las ausentes como no otorgadas", () => {
    const v = consentimientosVigentes({ vigente: { TRATAMIENTO: { otorgado: true, version_politica: "2026.1", fecha_hora: "2026-11-16T10:00:00Z" } } });
    expect(v.map((c) => [c.finalidad, c.otorgado])).toEqual([["TRATAMIENTO", true], ["COMERCIAL", false], ["PERFILADO", false]]);
  });
});

describe("contratos reales · M4 atractivo", () => {
  it("arma tarifas, horarios y accesibilidad en el formato de M4", () => {
    const b = toBody("atractivos", {
      nombre_es: "Museo", nombre_en: "Museum", descripcion_es: "d", descripcion_en: "d", categorias: "cultura", lat: "11.24", lng: "-74.21",
      tarifa_concepto_es: "Entrada", tarifa_monto: "15000", hora_apertura: "08:00", hora_cierre: "17:00", acc_rampa: "true", certificaciones: "",
    });
    expect(b.tarifas).toEqual([{ concepto: { es: "Entrada", en: "Entrada" }, precio: { monto: "15000.00", moneda: "COP" } }]);
    expect((b.horarios as unknown[]).length).toBe(7);
    expect(b.accesibilidad).toEqual({ movilidad_reducida: false, rampa: true, banio_adaptado: false });
    expect(b.sostenibilidad).toBeUndefined();
  });
});

describe("contratos reales · fechas", () => {
  it("agrupa las franjas por el día de Santa Marta (UTC-5), no por el día UTC", () => {
    expect(localDayOf("2026-11-17T03:00:00Z")).toBe("2026-11-16");
  });
  it("M9: rango mensual de 6 meses en formato YYYY-MM", () => {
    const { desde, hasta } = rangoMensual(6);
    expect(desde).toMatch(/^\d{4}-\d{2}$/);
    expect(hasta).toMatch(/^\d{4}-\d{2}$/);
    expect(desde < hasta).toBe(true);
  });
});
