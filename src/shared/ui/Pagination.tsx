"use client";

import { useTranslations } from "next-intl";
import { Button } from "./Button";

/** Paginación por número de página (M3/M4/M7/M8). La de M2 usa cursor (botón "Cargar más"). */
export function Pagination({
  page,
  pageSize,
  total,
  onChange,
  base = 0,
}: {
  page: number;
  pageSize: number;
  total: number;
  onChange: (page: number) => void;
  /** Primera página: 0 (M3/M7/M8) o 1 (M4). */
  base?: 0 | 1;
}) {
  const t = useTranslations("common.pagination");
  const lastPage = Math.max(base, Math.ceil(total / pageSize) - 1 + base);
  if (total <= pageSize) return null;
  return (
    <nav aria-label={t("label")} className="mt-4 flex items-center justify-between gap-4">
      <Button variant="secondary" disabled={page <= base} onClick={() => onChange(page - 1)}>
        {t("previous")}
      </Button>
      <p className="meta" aria-live="polite">
        {t("status", { page: page - base + 1, pages: lastPage - base + 1, total })}
      </p>
      <Button variant="secondary" disabled={page >= lastPage} onClick={() => onChange(page + 1)}>
        {t("next")}
      </Button>
    </nav>
  );
}
