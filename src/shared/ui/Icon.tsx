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
  search: "M11 4a7 7 0 100 14 7 7 0 000-14zm9 16l-4.35-4.35",
  pin: "M12 21s-7-6.2-7-11.5A7 7 0 0119 9.5C19 14.8 12 21 12 21zm0-9a2.5 2.5 0 100-5 2.5 2.5 0 000 5z",
  calendar: "M5 6h14v14H5zM5 10h14M9 3v4m6-4v4",
  user: "M12 12a4 4 0 100-8 4 4 0 000 8zm-7 9a7 7 0 0114 0",
  image: "M4 5h16v14H4zM4 15l4-4 4 4 3-3 5 5M15 9.5a1.5 1.5 0 100-3 1.5 1.5 0 000 3z",
  menu: "M4 7h16M4 12h16M4 17h16",
  logout: "M15 12H4m4-4l-4 4 4 4M13 4h6v16h-6",
  chevron: "M9 6l6 6-6 6",
  store: "M4 10l1.5-5h13L20 10M5 10v10h14V10M4 10a2.7 2.7 0 005.3 0 2.7 2.7 0 005.4 0 2.7 2.7 0 005.3 0M10 20v-5h4v5",
  grid: "M4 4h7v7H4zM13 4h7v7h-7zM4 13h7v7H4zM13 13h7v7h-7z",
  briefcase: "M4 8h16v11H4zM9 8V5h6v3M4 13h16",
  inbox: "M4 13l3-8h10l3 8v6H4zM4 13h5l1 2h4l1-2h5",
  qr: "M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h2v2h-2zM18 18h2v2h-2zM14 18h2M18 14h2",
  chart: "M4 20h16M7 16v-5M12 16V7M17 16v-8",
  shield: "M12 3l8 3v6c0 4.5-3.4 8.3-8 9-4.6-.7-8-4.5-8-9V6l8-3z",
  activity: "M3 12h4l3-8 4 16 3-8h4",
  download: "M12 4v11m-5-5l5 5 5-5M5 20h14",
  phone: "M8 2h8a2 2 0 012 2v16a2 2 0 01-2 2H8a2 2 0 01-2-2V4a2 2 0 012-2zm3 17h2",
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
