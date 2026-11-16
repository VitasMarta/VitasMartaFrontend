import { create } from "zustand";
import { decodeAccessToken, type SessionUser } from "./jwt";

/**
 * Sesión del usuario. El access_token vive SOLO en memoria (nunca localStorage); el refresh_token
 * está en una cookie httpOnly que el JavaScript no puede leer (RNF-04).
 */
export type SessionStatus = "unknown" | "authenticated" | "anonymous";

interface SessionState {
  status: SessionStatus;
  accessToken: string | null;
  user: SessionUser | null;
  setAccessToken: (token: string) => boolean;
  clear: () => void;
}

export const useSessionStore = create<SessionState>((set) => ({
  status: "unknown",
  accessToken: null,
  user: null,
  setAccessToken: (token) => {
    const user = decodeAccessToken(token);
    if (!user) {
      set({ status: "anonymous", accessToken: null, user: null });
      return false;
    }
    set({ status: "authenticated", accessToken: token, user });
    return true;
  },
  clear: () => set({ status: "anonymous", accessToken: null, user: null }),
}));

export const getAccessToken = (): string | null => useSessionStore.getState().accessToken;
