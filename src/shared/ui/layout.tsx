import type { ReactNode } from "react";
import { cn } from "./cn";

export function Container({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cn("mx-auto w-full max-w-7xl px-4 sm:px-6 lg:px-8", className)}>{children}</div>;
}

/** Franja de ancho completo (hero / secciones editoriales). */
export function Band({
  tone = "base",
  children,
  className,
  ...rest
}: { tone?: "base" | "mist" | "ink" | "card"; children: ReactNode; className?: string } & React.HTMLAttributes<HTMLElement>) {
  return (
    <section
      className={cn(
        "w-full",
        tone === "mist" && "bg-mist",
        tone === "base" && "bg-base",
        tone === "card" && "bg-card",
        tone === "ink" && "on-ink bg-ink text-mist",
        className,
      )}
      {...rest}
    >
      {children}
    </section>
  );
}

export function PageHeader({
  title,
  eyebrow,
  description,
  actions,
  tone = "card",
}: {
  title: ReactNode;
  eyebrow?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  tone?: "base" | "mist" | "card";
}) {
  return (
    <Band tone={tone} className="border-b border-line">
      <Container className="flex flex-col gap-4 py-8 sm:flex-row sm:items-end sm:justify-between">
        <div className="max-w-3xl">
          {eyebrow && <p className="meta mb-2 uppercase tracking-wider text-ink/80">{eyebrow}</p>}
          <h1>{title}</h1>
          {description && <p className="mt-3 text-lg text-ink/90">{description}</p>}
        </div>
        {actions && <div className="flex flex-wrap gap-3">{actions}</div>}
      </Container>
    </Band>
  );
}

/** Sección con título de nivel 2 y filete superior (sin caja). */
export function Section({
  title,
  description,
  actions,
  children,
  className,
  id,
}: {
  title?: ReactNode;
  description?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
  className?: string;
  id?: string;
}) {
  return (
    <section id={id} aria-labelledby={id ? `${id}-title` : undefined} className={cn("py-8", className)}>
      {(title || actions) && (
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3 border-t-2 border-ink pt-4">
          <div>
            {title && (
              <h2 id={id ? `${id}-title` : undefined} className="!text-2xl">
                {title}
              </h2>
            )}
            {description && <p className="mt-1 text-ink/80">{description}</p>}
          </div>
          {actions}
        </div>
      )}
      {children}
    </section>
  );
}

/** Pantalla dividida asimétrica (guía §1.3-2): 60 % lienzo continuo + 40 % lienzo fijo. */
export function SplitLayout({ left, right, rightLabel }: { left: ReactNode; right: ReactNode; rightLabel: string }) {
  return (
    <div className="lg:grid lg:grid-cols-[60fr_40fr]">
      <div className="min-w-0 px-4 py-8 sm:px-8 lg:border-r lg:border-ink/15">{left}</div>
      <aside aria-label={rightLabel} className="bg-mist px-4 py-8 sm:px-8 lg:sticky lg:top-0 lg:max-h-screen lg:self-start lg:overflow-y-auto">
        {right}
      </aside>
    </div>
  );
}

/** Banda de métricas continua (guía §1.3-3). */
export function MetricRibbon({
  items,
  label,
}: {
  label: string;
  items: { label: string; value: ReactNode; delta?: ReactNode }[];
}) {
  return (
    <section aria-label={label} className="bg-mist">
      <dl className="mx-auto grid max-w-7xl grid-cols-1 divide-y divide-ink/15 sm:grid-cols-2 sm:divide-x sm:divide-y-0 lg:grid-cols-[repeat(auto-fit,minmax(11rem,1fr))]">
        {items.map((item) => (
          <div key={item.label} className="px-6 py-6">
            <dt className="meta uppercase tracking-wider text-ink/80">{item.label}</dt>
            <dd className="mt-1 text-[2.5rem] font-bold leading-none tabular text-ink">{item.value}</dd>
            {item.delta && <dd className="meta mt-2 text-emerald-ink">{item.delta}</dd>}
          </div>
        ))}
      </dl>
    </section>
  );
}

/** Lista de definición tipográfica (atributos JSONB, resúmenes). */
export function DefinitionRows({ rows }: { rows: { term: ReactNode; value: ReactNode }[] }) {
  return (
    <dl className="divide-y divide-ink/15 border-y border-ink/15">
      {rows.map((row, i) => (
        <div key={i} className="flex flex-col gap-1 py-3 sm:flex-row sm:justify-between sm:gap-8">
          <dt className="font-medium text-ink/80">{row.term}</dt>
          <dd className="sm:text-right">{row.value}</dd>
        </div>
      ))}
    </dl>
  );
}
