"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import type { NivelSaturacion } from "@/core/api/types";
import { cn } from "./cn";
import { Icon } from "./Icon";

/** Umbrales por defecto de capacidad de carga (M8): 80 recomendación · 85 preventivo · 90 crítico. */
export function levelFromOccupancy(percent: number): NivelSaturacion {
  if (percent >= 90) return "CRITICO";
  if (percent >= 85) return "PREVENTIVO";
  if (percent >= 80) return "RECOMENDACION";
  return "NOMINAL";
}

/**
 * Indicador lineal de sostenibilidad: el estado se comunica SIEMPRE con ícono + texto
 * (no solo con color, WCAG 1.4.1). Ámbar/Coral exclusivos de los umbrales Preventivo/Crítico.
 */
export function SustainabilityIndicator({ level, occupancy }: { level: NivelSaturacion; occupancy?: number }) {
  const t = useTranslations("common.saturation");
  const fill = level === "CRITICO" ? "bg-critical" : level === "PREVENTIVO" ? "bg-preventive" : level === "RECOMENDACION" ? "bg-ink" : "bg-emerald";
  const text =
    level === "CRITICO" ? "text-critical" : level === "PREVENTIVO" ? "text-preventive-ink" : level === "NOMINAL" ? "text-emerald-ink" : "text-ink";
  const icon = level === "CRITICO" ? "octagon" : level === "NOMINAL" ? "leaf" : "alert";
  return (
    <span className="inline-flex flex-col gap-1">
      <span className={cn("meta inline-flex items-center gap-1.5 font-semibold", text)}>
        <Icon name={icon} size={16} />
        {t(level)}
        {occupancy !== undefined && <span className="tabular"> · {Math.round(occupancy)} %</span>}
      </span>
      {occupancy !== undefined && (
        <span aria-hidden="true" className="block h-1.5 w-36 overflow-hidden rounded-full bg-ink/15">
          <span className={cn("block h-full rounded-full", fill)} style={{ width: `${Math.min(100, Math.max(0, occupancy))}%` }} />
        </span>
      )}
    </span>
  );
}

export type Tone = "neutral" | "good" | "warn" | "bad" | "info";
const TONE_CLASS: Record<Tone, string> = {
  neutral: "text-ink",
  info: "text-ink",
  good: "text-emerald-ink",
  warn: "text-preventive-ink",
  bad: "text-critical",
};

/** Etiqueta de estado en línea (punto + texto; sin caja). */
export function StatusTag({ tone = "neutral", children }: { tone?: Tone; children: React.ReactNode }) {
  return (
    <span className={cn("meta inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-line bg-card px-2.5 py-0.5 font-semibold", TONE_CLASS[tone])}>
      <span aria-hidden="true" className="inline-block size-2 rounded-full bg-current" />
      {children}
    </span>
  );
}

/** Barra de progreso lineal accesible (exportaciones, trámites). */
export function ProgressBar({ label, value, indeterminate }: { label: string; value?: number; indeterminate?: boolean }) {
  return (
    <div>
      <p className="meta mb-1">{label}</p>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={indeterminate ? undefined : Math.round(value ?? 0)}
        className="h-2 w-full overflow-hidden rounded-full bg-ink/15"
      >
        <div
          className={cn("h-full rounded-full bg-action", indeterminate && "w-1/3 animate-pulse")}
          style={indeterminate ? undefined : { width: `${value ?? 0}%` }}
        />
      </div>
    </div>
  );
}

/** Pasos de un trámite (ARCO: 5 pasos). */
export function Stepper({ steps, current, label }: { steps: string[]; current: number; label: string }) {
  return (
    <ol aria-label={label} className="grid gap-2 sm:grid-cols-5">
      {steps.map((step, i) => {
        const done = i + 1 < current;
        const active = i + 1 === current;
        return (
          <li key={step} aria-current={active ? "step" : undefined} className={cn("border-t-4 pt-2", done || active ? "border-action" : "border-ink/15")}>
            <span className="meta block">{String(i + 1).padStart(2, "0")}</span>
            <span className={cn("block text-sm", active ? "font-bold" : done ? "font-medium" : "text-ink/80")}>{step}</span>
          </li>
        );
      })}
    </ol>
  );
}

/** Barra fija superior con cuenta regresiva (soft lock de reservas, guía §3.4). */
export function CountdownBar({ deadline, instruction, onExpire }: { deadline: string; instruction?: string | null; onExpire?: () => void }) {
  const t = useTranslations("reservas.countdown");
  const target = new Date(deadline).getTime();
  const [remaining, setRemaining] = useState(() => Math.max(0, target - Date.now()));
  const expired = remaining <= 0;

  useEffect(() => {
    const id = window.setInterval(() => {
      const left = Math.max(0, target - Date.now());
      setRemaining(left);
      if (left === 0) {
        window.clearInterval(id);
        onExpire?.();
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [target, onExpire]);

  const minutes = Math.floor(remaining / 60000);
  const seconds = Math.floor((remaining % 60000) / 1000);
  const clock = `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
  // Anuncio a lector de pantalla solo en hitos (no cada segundo).
  const announce = expired ? t("expired") : remaining <= 60000 ? t("lastMinute") : minutes % 5 === 0 && seconds === 0 ? t("remaining", { clock }) : "";

  return (
    <div className="on-ink sticky top-0 z-30 bg-ink text-mist">
      <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-1 px-4 py-3 sm:px-6 lg:px-8">
        <p className="flex items-center gap-2 font-semibold">
          <Icon name="clock" />
          {expired ? t("expired") : t("title")}
          {!expired && (
            <span role="timer" aria-label={t("remaining", { clock })} className="tabular text-xl font-bold">
              {clock}
            </span>
          )}
        </p>
        {instruction && <p className="text-sm">{instruction}</p>}
      </div>
      <p className="sr-only-live" role="status" aria-live="polite">
        {announce}
      </p>
    </div>
  );
}
