import type { ButtonHTMLAttributes, ComponentProps } from "react";
import { Link } from "@/core/i18n/navigation";
import { cn } from "./cn";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "emerald" | "danger" | "inverse";

const BASE =
  "inline-flex min-h-11 items-center justify-center gap-2 rounded-md px-5 py-2.5 text-[1rem] font-semibold transition-colors disabled:cursor-not-allowed disabled:opacity-60 aria-disabled:cursor-not-allowed aria-disabled:opacity-60";

const VARIANTS: Record<ButtonVariant, string> = {
  primary: "bg-action text-on-action hover:bg-action-strong",
  secondary: "border border-action bg-card text-action hover:bg-page",
  ghost: "text-action underline underline-offset-4 hover:bg-page",
  // Sobre la banda Azul Tinta (cabecera / hero): borde y texto blancos.
  inverse: "border border-on-action text-on-action hover:bg-on-action hover:text-ink",
  // Esmeralda original solo con texto grande y en negrita (>=18.66px/700 → 3.99:1, WCAG 1.4.3 texto grande).
  emerald: "bg-emerald text-ink text-[1.2rem] font-bold hover:brightness-95",
  danger: "bg-critical text-on-action hover:brightness-90",
};

export const buttonClass = (variant: ButtonVariant = "primary", className?: string) =>
  cn(BASE, VARIANTS[variant], className);

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
