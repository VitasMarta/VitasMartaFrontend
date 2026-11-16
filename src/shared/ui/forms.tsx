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

const CONTROL =
  "block w-full border-ink bg-base text-ink placeholder:text-ink/60 disabled:opacity-60 aria-[invalid=true]:border-critical";

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
      <label htmlFor={fid} className="block text-sm font-semibold">
        {label}
        {required && <span aria-hidden="true"> *</span>}
      </label>
      {hint && (
        <p id={`${fid}-hint`} className="text-sm text-ink/80">
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
        className={cn(CONTROL, "border-b-2 px-2 py-2.5")}
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
        className={cn(CONTROL, "border-2 px-3 py-2")}
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
        className={cn(CONTROL, "border-2 px-2 py-2.5")}
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
          className="mt-1 size-5 shrink-0 accent-ink"
        />
        {/* `text-base` en este proyecto también es el COLOR base (casi blanco): la etiqueta quedaba invisible. */}
        <label htmlFor={fid} className="text-ink">
          {label}
          {required && <span aria-hidden="true"> *</span>}
        </label>
      </div>
      {hint && (
        <p id={`${fid}-hint`} className="pl-8 text-sm text-ink/80">
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
    <div className="flex items-start justify-between gap-4 border-b border-ink/15 py-4">
      <div>
        <label htmlFor={fid} className="block font-semibold">
          {label}
        </label>
        {hint && (
          <p id={`${fid}-hint`} className="mt-1 text-sm text-ink/80">
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
        className="mt-1 size-6 shrink-0 accent-ink"
      />
    </div>
  );
}

/** Resumen de errores del formulario (WCAG 3.3.1): enlaza a cada campo con problema. */
export function ErrorSummary({ errors, title }: { errors: Record<string, string>; title: string }) {
  const entries = Object.entries(errors);
  if (entries.length === 0) return null;
  return (
    <div role="alert" className="border-l-4 border-critical bg-mist p-4">
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
