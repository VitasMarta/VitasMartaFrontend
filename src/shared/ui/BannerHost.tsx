"use client";

import { useTranslations } from "next-intl";
import { useUiStore, type BannerTone } from "@/core/store/uiStore";
import { cn } from "./cn";
import { Icon, type IconName } from "./Icon";

const TONE: Record<BannerTone, { barra: string; chip: string; icono: IconName }> = {
  info: { barra: "border-l-ink", chip: "bg-ink/10 text-ink", icono: "spark" },
  success: { barra: "border-l-emerald", chip: "bg-emerald/15 text-emerald-ink", icono: "check" },
  warn: { barra: "border-l-preventive", chip: "bg-preventive/15 text-preventive-ink", icono: "alert" },
  error: { barra: "border-l-critical", chip: "bg-critical/10 text-critical", icono: "alert" },
};

/** Avisos tipo banner superior (guía §2.1): tira de ancho completo, nunca una caja flotante. */
export function BannerHost() {
  const t = useTranslations("common");
  const banners = useUiStore((s) => s.banners);
  const dismiss = useUiStore((s) => s.dismiss);

  return (
    <div aria-live="polite" aria-atomic="false" className="sticky top-0 z-40">
      {banners.map((b) => (
        <div key={b.id} role={b.tone === "error" ? "alert" : "status"} className="border-b border-line bg-card shadow-sm">
          <div className={cn("mx-auto flex max-w-7xl items-center gap-3 border-l-4 px-4 py-3 sm:px-6 lg:px-8", TONE[b.tone].barra)}>
            <span aria-hidden="true" className={cn("inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-full", TONE[b.tone].chip)}>
              <Icon name={TONE[b.tone].icono} size={16} />
            </span>
            <p className="min-w-0 flex-1 font-medium">
              {b.message}
              {b.reference && (
                <span className="meta mt-0.5 block text-ink/70">
                  {t("reference")}: <span className="font-mono">{b.reference}</span>
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => dismiss(b.id)}
              className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-ink/70 hover:bg-page hover:text-ink"
              aria-label={t("close")}
            >
              <Icon name="x" />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
