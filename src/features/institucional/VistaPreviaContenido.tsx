"use client";

import type { ReactNode } from "react";
import { useLocale, useTranslations } from "next-intl";
import { formatCOP, formatDateTime, localized } from "@/core/format";
import { Icon } from "@/shared/ui/Icon";
import { StatusTag } from "@/shared/ui/indicators";
import { DefinitionRows } from "@/shared/ui/layout";

/**
 * Vista previa legible de la proyección de M4 (`GET /admin/contenido/{id}/proyeccion`):
 * `{ documento, validacion, publicable, claves_omitidas }`. El documento es el mismo que M4
 * publica a M2 (atractivo, actividad o evento); lo que no se reconoce va a "Otros datos".
 */
type Doc = Record<string, unknown>;
type Texto = { es?: string; en?: string } | string | null | undefined;
type Precio = { monto?: string | number; moneda?: string } | null | undefined;

const CLAVES_CONOCIDAS = new Set([
  "tarifas", "horarios", "accesibilidad", "condiciones_acceso", "certificaciones_sostenibilidad", "sostenibilidad",
  "precio", "operador", "duracion_minutos", "nivel_dificultad", "equipamiento", "incluye", "edad_minima", "capacidad_maxima",
  "fecha_inicio", "fecha_fin", "cupo_total", "organizador", "modalidad",
]);

const esObjeto = (v: unknown): v is Doc => typeof v === "object" && v !== null && !Array.isArray(v);

function useTexto() {
  const locale = useLocale();
  return (v: Texto) => (typeof v === "string" ? v : localized(v ?? undefined, locale) ?? "");
}

function Fotos({ multimedia, alt }: { multimedia: unknown; alt: string }) {
  const t = useTranslations("admin.moderation.doc");
  const fotos = (Array.isArray(multimedia) ? multimedia : [])
    .filter((m): m is { tipo: string; url_cdn: string; orden?: number } => esObjeto(m) && typeof m.url_cdn === "string")
    .sort((a, b) => (a.orden ?? 0) - (b.orden ?? 0));
  if (fotos.length === 0) {
    return <p className="flex items-center gap-2 rounded-lg bg-page px-4 py-3 text-sm text-ink/70"><Icon name="image" size={16} />{t("noMedia")}</p>;
  }
  const visibles = fotos.slice(0, 4);
  return (
    <ul role="list" aria-label={t("media", { count: fotos.length })} className="grid grid-cols-4 gap-2">
      {visibles.map((m, i) => (
        <li key={m.url_cdn} className="relative aspect-square overflow-hidden rounded-lg bg-page">
          {m.tipo === "foto" ? (
            // eslint-disable-next-line @next/next/no-img-element -- CDN de R2 (sin next/image)
            <img src={m.url_cdn} alt={`${alt} — ${i + 1}`} className="h-full w-full object-cover" />
          ) : (
            <span className="flex h-full items-center justify-center text-xs font-semibold text-ink/70">{t("video")}</span>
          )}
          {i === visibles.length - 1 && fotos.length > visibles.length && (
            <span className="absolute inset-0 flex items-center justify-center bg-ink/55 text-sm font-semibold text-on-action">+{fotos.length - visibles.length}</span>
          )}
        </li>
      ))}
    </ul>
  );
}

function resumenHorario(horarios: unknown, dia: (n: number) => string, todos: (r: string) => string): string | null {
  const lista = (Array.isArray(horarios) ? horarios : []).filter(esObjeto);
  if (lista.length === 0) return null;
  const rango = (h: Doc) => `${String(h.hora_inicio).slice(0, 5)}–${String(h.hora_fin).slice(0, 5)}`;
  const rangos = new Set(lista.map(rango));
  if (lista.length === 7 && rangos.size === 1) return todos(rango(lista[0]));
  return lista
    .sort((a, b) => Number(a.dia_semana) - Number(b.dia_semana))
    .map((h) => `${dia(Number(h.dia_semana))} ${rango(h)}`)
    .join(" · ");
}

export function VistaPreviaContenido({ data }: { data: Doc }) {
  const t = useTranslations("admin.moderation.doc");
  const locale = useLocale();
  const texto = useTexto();
  const doc = esObjeto(data.documento) ? data.documento : data;
  const atr = esObjeto(doc.atributos) ? doc.atributos : {};
  const nombre = texto(doc.nombre as Texto);
  const nombreEn = esObjeto(doc.nombre) && typeof doc.nombre.en === "string" ? doc.nombre.en : "";
  const desc = esObjeto(doc.descripcion) ? (doc.descripcion as { es?: string; en?: string }) : { es: texto(doc.descripcion as Texto) };
  const valida = data.validacion === "valida";
  const publicable = data.publicable !== false;
  const omitidas = Array.isArray(data.claves_omitidas) ? (data.claves_omitidas as string[]) : [];

  const precio = (p: Precio) => (p && p.monto != null && !Number.isNaN(Number(p.monto)) ? formatCOP(Number(p.monto), locale) : null);
  const lista = (v: unknown) => (Array.isArray(v) ? v.map((x) => texto(x as Texto)).filter(Boolean).join(", ") : "");

  const filas: { term: ReactNode; value: ReactNode }[] = [];
  const agregar = (term: string, value: ReactNode) => {
    if (value !== null && value !== undefined && value !== "") filas.push({ term, value });
  };

  agregar(t("categories"), lista(doc.categoria ?? doc.categorias));
  if (esObjeto(doc.ubicacion) && doc.ubicacion.lat != null) {
    const { lat, lng } = doc.ubicacion as { lat: number; lng: number };
    agregar(t("location"), (
      <a href={`https://www.google.com/maps?q=${lat},${lng}`} target="_blank" rel="noreferrer" className="text-link">
        {Number(lat).toFixed(4)}, {Number(lng).toFixed(4)}
      </a>
    ));
  }
  // Atractivo
  if (Array.isArray(atr.tarifas) && atr.tarifas.length > 0) {
    agregar(t("rates"), (
      <ul className="space-y-0.5">
        {atr.tarifas.filter(esObjeto).map((tf, i) => <li key={i}>{texto(tf.concepto as Texto)}: <strong>{precio(tf.precio as Precio) ?? "—"}</strong></li>)}
      </ul>
    ));
  }
  agregar(t("schedule"), resumenHorario(atr.horarios, (n) => t(`days.${n}`), (r) => t("everyDay", { range: r })));
  // Actividad / evento
  agregar(t("price"), precio(atr.precio as Precio));
  if (atr.duracion_minutos != null) agregar(t("duration"), t("minutes", { count: Number(atr.duracion_minutos) }));
  if (atr.nivel_dificultad) agregar(t("difficulty"), t.has(`levels.${atr.nivel_dificultad}`) ? t(`levels.${atr.nivel_dificultad}`) : String(atr.nivel_dificultad));
  if (esObjeto(atr.operador)) agregar(t("operator"), texto(atr.operador.nombre as Texto));
  if (esObjeto(atr.organizador)) agregar(t("organizer"), texto(atr.organizador.nombre as Texto));
  if (atr.fecha_inicio) agregar(t("dates"), `${formatDateTime(String(atr.fecha_inicio), locale)} → ${atr.fecha_fin ? formatDateTime(String(atr.fecha_fin), locale) : "—"}`);
  if (atr.cupo_total != null) agregar(t("capacity"), String(atr.cupo_total));
  if (atr.capacidad_maxima != null) agregar(t("capacity"), String(atr.capacidad_maxima));
  if (atr.edad_minima != null) agregar(t("minAge"), String(atr.edad_minima));
  if (atr.modalidad) agregar(t("mode"), String(atr.modalidad));
  agregar(t("includes"), lista(atr.incluye));
  agregar(t("equipment"), lista(atr.equipamiento));
  // Comunes
  if (esObjeto(atr.accesibilidad)) {
    const si = Object.entries(atr.accesibilidad).filter(([, v]) => v === true).map(([k]) => (t.has(`access.${k}`) ? t(`access.${k}`) : k));
    agregar(t("accessibility"), si.length ? si.join(", ") : t("notReported"));
  }
  agregar(t("accessConditions"), texto(atr.condiciones_acceso as Texto));
  agregar(t("certifications"), lista(atr.certificaciones_sostenibilidad ?? (esObjeto(atr.sostenibilidad) ? atr.sostenibilidad.certificaciones : undefined)));

  const otros = Object.fromEntries(Object.entries(atr).filter(([k, v]) => !CLAVES_CONOCIDAS.has(k) && v != null && v !== ""));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center gap-2">
        <StatusTag tone={valida && publicable ? "good" : "warn"}>{valida && publicable ? t("valid") : t("invalid")}</StatusTag>
        {omitidas.length > 0 && <span className="meta text-ink/70">{t("omitted", { keys: omitidas.join(", ") })}</span>}
      </div>

      <Fotos multimedia={doc.multimedia} alt={nombre} />

      <div className="space-y-2">
        <p className="text-lg font-semibold leading-snug">{nombre}</p>
        {nombreEn && nombreEn !== nombre && (
          <p className="meta text-ink/70"><span className="font-semibold">EN</span> · {nombreEn}</p>
        )}
        {desc.es && <p className="whitespace-pre-line text-ink/90">{desc.es}</p>}
        {desc.en && (
          <details className="rounded-lg bg-page px-3 py-2 text-sm">
            <summary className="cursor-pointer font-medium">{t("english")}</summary>
            <p className="mt-2 whitespace-pre-line text-ink/85">{desc.en}</p>
          </details>
        )}
      </div>

      {filas.length > 0 && <DefinitionRows rows={filas} />}

      {Object.keys(otros).length > 0 && (
        <details className="rounded-lg border border-line px-3 py-2 text-sm">
          <summary className="cursor-pointer font-medium">{t("other")}</summary>
          <pre className="mt-2 max-h-60 overflow-auto whitespace-pre-wrap break-words text-xs text-ink/80">{JSON.stringify(otros, null, 2)}</pre>
        </details>
      )}
    </div>
  );
}

/** Transiciones que el administrador puede pedir según el estado (máquina de estados de M4). */
export const ACCIONES_POR_ESTADO: Record<string, string[]> = {
  en_revision: ["aprobar", "devolver", "rechazar"],
  aprobado: ["publicar", "devolver", "archivar"],
  publicado: ["archivar"],
};
