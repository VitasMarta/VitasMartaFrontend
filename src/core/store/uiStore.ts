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

/** Avisos tipo banner superior (guía §2.1). */
export const useUiStore = create<UiState>((set) => ({
  banners: [],
  push: (banner) => {
    const id = crypto.randomUUID();
    set((s) => ({ banners: [...s.banners.slice(-2), { ...banner, id }] }));
    return id;
  },
  dismiss: (id) => set((s) => ({ banners: s.banners.filter((b) => b.id !== id) })),
}));
