import type { ReactNode } from "react";
import { cn } from "./cn";

export interface Column<T> {
  key: string;
  header: ReactNode;
  cell: (row: T) => ReactNode;
  align?: "left" | "right";
  className?: string;
}

/**
 * Tabla editorial limpia (guía §1.3-4): sin borde exterior, cabecera en versalitas sobre Rosa Niebla,
 * filas con filete inferior. Semántica real: <table>, <thead>, <th scope="col">, <tbody>.
 */
export function EditorialTable<T>({
  caption,
  columns,
  rows,
  rowKey,
  empty,
  className,
}: {
  caption: string;
  columns: Column<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  className?: string;
}) {
  return (
    <div className={cn("card w-full overflow-x-auto", className)}>
      <table className="w-full border-collapse text-left">
        <caption className="sr-only">{caption}</caption>
        <thead>
          <tr className="border-b border-line bg-page">
            {columns.map((c) => (
              <th
                key={c.key}
                scope="col"
                className={cn(
                  "meta whitespace-nowrap px-4 py-3 text-xs font-semibold uppercase tracking-wider text-ink/80",
                  c.align === "right" && "text-right",
                )}
              >
                {c.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)} className="border-b border-line align-top last:border-b-0 hover:bg-page focus-within:bg-page">
              {columns.map((c) => (
                <td key={c.key} className={cn("px-4 py-3", c.align === "right" && "text-right tabular", c.className)}>
                  {c.cell(row)}
                </td>
              ))}
            </tr>
          ))}
          {rows.length === 0 && (
            <tr>
              <td colSpan={columns.length} className="px-4 py-8 text-center text-ink/80">
                {empty}
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
