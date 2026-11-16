"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Icon } from "./Icon";

const FOCUSABLE =
  'a[href],button:not([disabled]),input:not([disabled]),select:not([disabled]),textarea:not([disabled]),[tabindex]:not([tabindex="-1"])';

/**
 * Panel deslizante (guía §1.3-5) en lugar de modales flotantes. Panel a alto completo anclado a la
 * derecha, fondo Rosa Niebla y borde izquierdo Azul Tinta. A11y: role="dialog" + aria-modal,
 * foco atrapado, Escape cierra y el foco vuelve al disparador.
 */
export function SlideOver({
  open,
  onClose,
  title,
  children,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
}) {
  const t = useTranslations("common");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const previouslyFocused = document.activeElement as HTMLElement | null;
    const panel = panelRef.current;
    const focusables = () => Array.from(panel?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);

    // Enfoca el primer campo del cuerpo (no el botón de cerrar) si existe.
    const first = focusables().find((el) => el.dataset.closeButton === undefined) ?? focusables()[0];
    (first ?? panel)?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusables();
      if (items.length === 0) {
        event.preventDefault();
        return;
      }
      const firstItem = items[0];
      const lastItem = items[items.length - 1];
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };

    document.addEventListener("keydown", onKeyDown);
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
      previouslyFocused?.focus();
    };
  }, [open]);

  if (!open) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex justify-end">
      <div className="absolute inset-0 bg-ink/50" aria-hidden="true" onClick={() => closeRef.current()} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex h-screen w-full max-w-lg flex-col overflow-y-auto border-l-2 border-ink bg-mist p-6 sm:p-8"
      >
        <div className="mb-6 flex items-start justify-between gap-4">
          <h2 id={titleId} className="!text-2xl">
            {title}
          </h2>
          <button
            type="button"
            data-close-button
            onClick={() => closeRef.current()}
            className="inline-flex min-h-11 min-w-11 items-center justify-center text-ink hover:bg-base"
            aria-label={t("close")}
          >
            <Icon name="x" size={22} />
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
