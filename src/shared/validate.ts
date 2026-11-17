import type { ZodType } from "zod";

export type FieldErrors = Record<string, string>;

/** Valida con zod y devuelve errores por campo (primer mensaje de cada campo) para `ErrorSummary`. */
export function validate<T>(schema: ZodType<T>, input: unknown): { data: T; errors: null } | { data: null; errors: FieldErrors } {
  const result = schema.safeParse(input);
  if (result.success) return { data: result.data, errors: null };
  const errors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? "form");
    errors[key] ??= issue.message;
  }
  return { data: null, errors };
}

/** Lee un <form> como objeto plano (checkbox → boolean, vacío → undefined). */
export function formValues(form: HTMLFormElement): Record<string, string | boolean | undefined> {
  const out: Record<string, string | boolean | undefined> = {};
  for (const el of Array.from(form.elements)) {
    if (!(el instanceof HTMLInputElement || el instanceof HTMLSelectElement || el instanceof HTMLTextAreaElement) || !el.name) continue;
    if (el instanceof HTMLInputElement && el.type === "checkbox") out[el.name] = el.checked;
    else if (el instanceof HTMLInputElement && el.type === "radio") {
      if (el.checked) out[el.name] = el.value;
    } else out[el.name] = el.value === "" ? undefined : el.value;
  }
  return out;
}

/** Contraseña (RF-08-11): ≥ 12 caracteres con mayúscula, minúscula, número y símbolo. */
export const PASSWORD_RULES = {
  length: (p: string) => p.length >= 12,
  upper: (p: string) => /[A-ZÁÉÍÓÚÑ]/.test(p),
  lower: (p: string) => /[a-záéíóúñ]/.test(p),
  number: (p: string) => /\d/.test(p),
  symbol: (p: string) => /[^A-Za-z0-9ÁÉÍÓÚÑáéíóúñ\s]/.test(p),
} as const;
export const isStrongPassword = (p: string) => Object.values(PASSWORD_RULES).every((rule) => rule(p));
