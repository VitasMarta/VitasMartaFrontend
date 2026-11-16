import type { ReactNode } from "react";
import { ApiError } from "@/core/api/errorNormalizer";
import { cn } from "./cn";
import { Icon } from "./Icon";

/**
 * Estados de carga / vacío / error en línea (sin cajas): filetes y barras de esqueleto.
 */
export function StatusBlock({
  kind,
  title,
  children,
  className,
}: {
  kind: "loading" | "empty" | "error";
  title: string;
  children?: ReactNode;
  className?: string;
}) {
  if (kind === "loading") {
    return (
      <div role="status" aria-live="polite" className={cn("space-y-3 py-8", className)}>
        <span className="sr-only">{title}</span>
        <div aria-hidden="true" className="space-y-3">
          <div className="h-4 w-2/3 animate-pulse bg-ink/15" />
          <div className="h-4 w-1/2 animate-pulse bg-ink/15" />
          <div className="h-4 w-3/5 animate-pulse bg-ink/15" />
        </div>
      </div>
    );
  }
  return (
    <div
      role={kind === "error" ? "alert" : "status"}
      className={cn("border-l-4 py-4 pl-4", kind === "error" ? "border-critical" : "border-ink/30", className)}
    >
      <p className={cn("flex items-center gap-2 font-semibold", kind === "error" && "text-critical")}>
        {kind === "error" && <Icon name="alert" />}
        {title}
      </p>
      {children && <div className="mt-1 text-ink/90">{children}</div>}
    </div>
  );
}

/** Mensaje de error de API con referencia de soporte (correlation_id / trace_id). */
export function ErrorNotice({ error, referenceLabel }: { error: unknown; referenceLabel: string }) {
  const message = error instanceof Error ? error.message : String(error);
  const reference = error instanceof ApiError ? error.correlationId : undefined;
  return (
    <div role="alert" className="border-l-4 border-critical py-2 pl-4">
      <p className="flex items-center gap-2 font-semibold text-critical">
        <Icon name="alert" />
        {message}
      </p>
      {reference && (
        <p className="meta mt-1 text-ink/80">
          {referenceLabel}: <span className="font-mono">{reference}</span>
        </p>
      )}
    </div>
  );
}
