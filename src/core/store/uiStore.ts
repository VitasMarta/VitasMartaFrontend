import { create } from "zustand";

export type BannerTone = "info" | "success" | "warn" | "error";
export interface BannerMessage {
  id: string;
  tone: BannerTone;
  message: string;
  /** Para soporte: correlation_id / trace_id del error. */
  reference?: string;
}

interface UiState {
  banners: BannerMessage[];
  push: (banner: Omit<BannerMessage, "id">) => string;
  dismiss: (id: string) => void;
}

const AUTOCIERRE_MS = 6000;

/** Avisos tipo banner superior (guía §2.1). */
export const useUiStore = create<UiState>((set) => ({
  banners: [],
  push: (banner) => {
    const id = crypto.randomUUID();
    set((s) => ({ banners: [...s.banners.slice(-2), { ...banner, id }] }));
    if (typeof window !== "undefined" && (banner.tone === "success" || banner.tone === "info")) {
      window.setTimeout(() => useUiStore.getState().dismiss(id), AUTOCIERRE_MS);
    }
    return id;
  },
  dismiss: (id) => set((s) => ({ banners: s.banners.filter((b) => b.id !== id) })),
}));
