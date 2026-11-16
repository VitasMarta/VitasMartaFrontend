"use client";

import { useTranslations } from "next-intl";
import { useUiStore, type BannerTone } from "@/core/store/uiStore";
import { cn } from "./cn";
import { Icon } from "./Icon";

const TONE: Record<BannerTone, string> = {
  info: "bg-mist border-ink",
  success: "bg-mist border-emerald",
  warn: "bg-mist border-preventive",
  error: "bg-mist border-critical",
};

/** Avisos tipo banner superior (guía §2.1): tira de ancho completo, nunca una caja flotante. */
export function BannerHost() {
  const t = useTranslations("common");
  const banners = useUiStore((s) => s.banners);
  const dismiss = useUiStore((s) => s.dismiss);

  return (
    <div aria-live="polite" aria-atomic="false" className="sticky top-0 z-40">
      {banners.map((b) => (
        <div key={b.id} role={b.tone === "error" ? "alert" : "status"} className={cn("border-b-2", TONE[b.tone])}>
          <div className="mx-auto flex max-w-7xl items-start justify-between gap-4 px-4 py-3 sm:px-6 lg:px-8">
            <p className="font-medium">
              {b.tone === "error" && <Icon name="alert" className="mr-2 inline text-critical" />}
              {b.tone === "success" && <Icon name="check" className="mr-2 inline text-emerald-ink" />}
              {b.message}
              {b.reference && (
                <span className="meta ml-2 text-ink/80">
                  {t("reference")}: <span className="font-mono">{b.reference}</span>
                </span>
              )}
            </p>
            <button
              type="button"
              onClick={() => dismiss(b.id)}
              className="inline-flex min-h-9 min-w-9 shrink-0 items-center justify-center hover:bg-base"
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
