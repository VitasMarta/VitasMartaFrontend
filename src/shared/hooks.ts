"use client";

import { useEffect } from "react";

/** Título de documento único por pantalla (WCAG 2.4.2). */
export function useDocumentTitle(title: string | undefined) {
  useEffect(() => {
    if (title) document.title = `${title} · VITASMARTA`;
  }, [title]);
}

/** Convierte `ApiError.fieldErrors()` + validaciones locales en un mapa campo → mensaje. */
export function firstError(errors: Record<string, string>): string | undefined {
  return Object.values(errors)[0];
}
