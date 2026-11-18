"use client";

import type { InputHTMLAttributes, ReactNode, SelectHTMLAttributes, TextareaHTMLAttributes } from "react";
import { cn } from "./cn";

interface FieldBase {
  label: string;
  name: string;
  error?: string;
  hint?: string;
  required?: boolean;
}

const idOf = (name: string, id?: string) => id ?? `field-${name}`;

/**
 * Control de formulario minimalista: borde suave (tinta al 55 % ≈ 3,5:1, WCAG 1.4.11), esquinas
 * amplias y, al enfocar, borde de acción con halo suave en lugar del contorno grueso global.
 */
const CONTROL =
  "form-control block w-full rounded-lg border border-ink/55 bg-card text-ink shadow-[0_1px_2px_rgba(29,43,92,0.04)] transition-[border-color,box-shadow] duration-150 placeholder:text-ink/50 hover:border-ink/75 focus:outline-none focus-visible:outline-none focus:border-action focus:ring-4 focus:ring-action/15 [&[readonly]]:bg-page disabled:cursor-not-allowed disabled:bg-page disabled:opacity-70 aria-[invalid=true]:border-critical aria-[invalid=true]:focus:ring-critical/15";

/** Flecha propia del select (la nativa se ve distinta en cada navegador): ver `.select-arrow` en globals.css. */
const SELECT_ARROW = "select-arrow appearance-none pr-10";

function FieldShell({
  label,
  name,
  id,
  error,
  hint,
  required,
  children,
  className,
}: FieldBase & { id?: string; children: ReactNode; className?: string }) {
  const fid = idOf(name, id);
  return (
    <div className={cn("space-y-1.5", className)}>
      <label htmlFor={fid} className="block text-sm font-medium text-ink/90">
        {label}
        {required && <span aria-hidden="true" className="text-critical"> *</span>}
      </label>
      {hint && (
        <p id={`${fid}-hint`} className="text-[0.8125rem] leading-snug text-ink/70">
          {hint}
        </p>
      )}
      {children}
      {error && (
        <p id={`${fid}-error`} role="alert" className="text-sm font-medium text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

const describedBy = (fid: string, error?: string, hint?: string) =>
  [hint ? `${fid}-hint` : null, error ? `${fid}-error` : null].filter(Boolean).join(" ") || undefined;

export function TextField({
  label,
  name,
  error,
  hint,
  required,
  className,
  ...input
}: FieldBase & Omit<InputHTMLAttributes<HTMLInputElement>, "name"> & { className?: string }) {
  const fid = idOf(name, input.id);
  return (
    <FieldShell label={label} name={name} id={input.id} error={error} hint={hint} required={required} className={className}>
      <input
        {...input}
        id={fid}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        className={cn(CONTROL, "min-h-11 px-3.5 py-2.5")}
      />
    </FieldShell>
  );
}

export function TextAreaField({
  label,
  name,
  error,
  hint,
  required,
  className,
  ...input
}: FieldBase & Omit<TextareaHTMLAttributes<HTMLTextAreaElement>, "name"> & { className?: string }) {
  const fid = idOf(name, input.id);
  return (
    <FieldShell label={label} name={name} id={input.id} error={error} hint={hint} required={required} className={className}>
      <textarea
        rows={4}
        {...input}
        id={fid}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        className={cn(CONTROL, "resize-y px-3.5 py-2.5 leading-relaxed")}
      />
    </FieldShell>
  );
}

export function SelectField({
  label,
  name,
  error,
  hint,
  required,
  className,
  children,
  ...input
}: FieldBase & Omit<SelectHTMLAttributes<HTMLSelectElement>, "name"> & { className?: string }) {
  const fid = idOf(name, input.id);
  return (
    <FieldShell label={label} name={name} id={input.id} error={error} hint={hint} required={required} className={className}>
      <select
        {...input}
        id={fid}
        name={name}
        required={required}
        aria-invalid={error ? true : undefined}
        aria-describedby={describedBy(fid, error, hint)}
        className={cn(CONTROL, SELECT_ARROW, "min-h-11 cursor-pointer px-3.5 py-2.5")}
      >
        {children}
      </select>
    </FieldShell>
  );
}

export function CheckboxField({
  label,
  name,
  error,
  hint,
  required,
  className,
  ...input
}: FieldBase & Omit<InputHTMLAttributes<HTMLInputElement>, "name" | "type"> & { className?: string }) {
  const fid = idOf(name, input.id);
  return (
    <div className={cn("space-y-1", className)}>
      <div className="flex items-start gap-3">
        <input
          {...input}
          id={fid}
          name={name}
          type="checkbox"
          required={required}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fid, error, hint)}
          className="mt-0.5 size-[1.15rem] shrink-0 cursor-pointer rounded accent-action"
        />
        {/* `text-base` en este proyecto también es el COLOR base (casi blanco): la etiqueta quedaba invisible. */}
        <label htmlFor={fid} className="cursor-pointer text-ink/90">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      </div>
      {hint && (
        <p id={`${fid}-hint`} className="pl-8 text-[0.8125rem] text-ink/70">
          {hint}
        </p>
      )}
      {error && (
        <p id={`${fid}-error`} role="alert" className="pl-8 text-sm font-medium text-critical">
          {error}
        </p>
      )}
    </div>
  );
}

/** Interruptor accesible (checkbox con role="switch"). */
export function SwitchField({
  label,
  name,
  hint,
  checked,
  onChange,
  disabled,
}: {
  label: string;
  name: string;
  hint?: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  disabled?: boolean;
}) {
  const fid = idOf(name);
  return (
    <div className="flex items-start justify-between gap-4 border-b border-line/70 py-4 last:border-b-0">
      <div>
        <label htmlFor={fid} className="block font-medium">
          {label}
        </label>
        {hint && (
          <p id={`${fid}-hint`} className="mt-1 text-[0.8125rem] text-ink/70">
            {hint}
          </p>
        )}
      </div>
      <input
        id={fid}
        name={name}
        type="checkbox"
        role="switch"
        checked={checked}
        disabled={disabled}
        aria-describedby={hint ? `${fid}-hint` : undefined}
        onChange={(e) => onChange(e.target.checked)}
        className="mt-1 size-5 shrink-0 cursor-pointer accent-action"
      />
    </div>
  );
}

/** Resumen de errores del formulario (WCAG 3.3.1): enlaza a cada campo con problema. */
export function ErrorSummary({ errors, title }: { errors: Record<string, string>; title: string }) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;
  return (
    <div role="alert" className="rounded-lg border border-critical/25 bg-critical/5 p-4">
      <p className="font-semibold text-critical">{title}</p>
      <ul className="mt-2 list-disc pl-5">
        {entries.map(([name, message]) => (
          <li key={name}>
            <a href={`#field-${name}`} className="text-link">
              {message}
            </a>
          </li>
        ))}
      </ul>
    </div>
  );
}
