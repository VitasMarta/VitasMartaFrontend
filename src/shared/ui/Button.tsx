import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { Link } from "@/core/i18n/navigation";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "emerald" | "danger" | "inverse";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-5 py-2.5 text-[0.975rem] font-semibold transition-[background-color,border-color,color,box-shadow] duration-150 disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-action text-on-action hover:bg-action-strong",
  secondary: "border border-action/60 bg-card text-action hover:border-action hover:bg-action/5",
  ghost: "text-action underline underline-offset-4 hover:bg-page",
  // Sobre la banda Azul Tinta (cabecera / hero): borde y texto blancos.
  inverse: "border border-on-action text-on-action hover:bg-on-action hover:text-ink",
  // Esmeralda original solo con texto grande y en negrita (>=18.66px/700 → 3.99:1, WCAG 1.4.3 texto grande).
  emerald: "bg-emerald text-ink text-[1.2rem] font-bold hover:brightness-95",
  danger: "bg-critical text-on-action hover:brightness-90",
};

export const buttonClass = (variant: ButtonVariant = "primary", className?: string) =>
  cn(BASE, VARIANTS[variant], className);

/**
 * Acciones dentro de filas de tabla: botón compacto con contorno fino, sin peso visual hasta el
 * hover. `positive` para la acción principal (confirmar), `danger` para las destructivas.
 */
export type ActionTone = "neutral" | "positive" | "danger";
const ACTION_TONES: Record<ActionTone, string> = {
  neutral: "border-line text-ink hover:border-ink/40 hover:bg-page",
  positive: "border-emerald/60 text-emerald-ink hover:bg-emerald/10",
  danger: "border-line text-critical hover:border-critical/50 hover:bg-critical/5",
};
export const actionButtonClass = (tone: ActionTone = "neutral", className?: string) =>
  cn(
    "inline-flex h-8 items-center justify-center whitespace-nowrap rounded-full border bg-card px-3.5 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-60",
    ACTION_TONES[tone],
    className,
  );

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; loading?: boolean };

export function Button({ variant = "primary", loading, className, children, disabled, type = "button", ...props }: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass(variant, className)}
      disabled={disabled || loading}
      aria-busy={loading || undefined}
      {...props}
    >
      {children}
    </button>
  );
}

type LinkProps = ComponentProps<typeof Link> & { variant?: ButtonVariant };
export function ButtonLink({ variant = "primary", className, ...props }: LinkProps) {
  return <Link className={buttonClass(variant, className)} {...props} />;
}
