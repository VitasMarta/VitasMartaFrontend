import type { SVGProps } from "react";

/** Íconos mínimos en línea (decorativos: siempre acompañados de texto, `aria-hidden`). */
const PATHS = {
  check: "M5 13l4 4L19 7",
  alert: "M12 3l10 18H2L12 3zm0 7v5m0 3v.01",
  octagon: "M8 3h8l5 5v8l-5 5H8l-5-5V8l5-5zm4 5v5m0 3v.01",
  arrow: "M5 12h14m-6-6l6 6-6 6",
  x: "M6 6l12 12M18 6L6 18",
  clock: "M12 7v5l3 2M12 3a9 9 0 100 18 9 9 0 000-18z",
  leaf: "M5 19c0-9 5-14 14-14 0 9-5 14-14 14zm0 0c2-4 5-7 9-9",
  spark: "M12 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2 2-6z",
} as const;

export type IconName = keyof typeof PATHS;

export function Icon({ name, size = 18, ...props }: { name: IconName; size?: number } & SVGProps<SVGSVGElement>) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      <path d={PATHS[name]} />
    </svg>
  );
}
