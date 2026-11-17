"use client";

import { useId, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { cn } from "./cn";

export interface TabItem {
  id: string;
  label: string;
  content: ReactNode;
}

/**
 * Pestañas con patrón ARIA completo: role=tablist/tab/tabpanel, flechas ←/→, Inicio/Fin
 * y tabulación roving (solo la pestaña activa está en el orden de Tab).
 */
export function Tabs({
  tabs,
  label,
  value,
  defaultValue,
  onChange,
}: {
  tabs: TabItem[];
  label: string;
  value?: string;
  /** Pestaña inicial (no controlada); si no existe se usa la primera. */
  defaultValue?: string;
  onChange?: (id: string) => void;
}) {
  const base = useId();
  const [internal, setInternal] = useState(tabs.some((x) => x.id === defaultValue) ? defaultValue : tabs[0]?.id);
  const active = value ?? internal;
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  const select = (id: string) => {
    setInternal(id);
    onChange?.(id);
    refs.current[id]?.focus();
  };

  const onKeyDown = (event: KeyboardEvent, index: number) => {
    const last = tabs.length - 1;
    const next =
      event.key === "ArrowRight" ? (index === last ? 0 : index + 1)
      : event.key === "ArrowLeft" ? (index === 0 ? last : index - 1)
      : event.key === "Home" ? 0
      : event.key === "End" ? last
      : null;
    if (next === null) return;
    event.preventDefault();
    select(tabs[next].id);
  };

  return (
    <div>
      <div role="tablist" aria-label={label} className="flex flex-wrap gap-x-2 border-b border-line">
        {tabs.map((tab, i) => {
          const selected = tab.id === active;
          return (
            <button
              key={tab.id}
              ref={(el) => {
                refs.current[tab.id] = el;
              }}
              role="tab"
              type="button"
              id={`${base}-tab-${tab.id}`}
              aria-selected={selected}
              aria-controls={`${base}-panel-${tab.id}`}
              tabIndex={selected ? 0 : -1}
              onClick={() => select(tab.id)}
              onKeyDown={(e) => onKeyDown(e, i)}
              className={cn(
                "-mb-px min-h-11 rounded-t-md border-b-[3px] px-4 py-2 font-semibold transition-colors hover:bg-card",
                selected ? "border-action text-action" : "border-transparent text-ink/80",
              )}
            >
              {tab.label}
            </button>
          );
        })}
      </div>
      {tabs.map((tab) => (
        <div
          key={tab.id}
          role="tabpanel"
          id={`${base}-panel-${tab.id}`}
          aria-labelledby={`${base}-tab-${tab.id}`}
          hidden={tab.id !== active}
          tabIndex={0}
          className="pt-6"
        >
          {tab.id === active && tab.content}
        </div>
      ))}
    </div>
  );
}
