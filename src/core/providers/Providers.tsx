"use client";

import { useEffect, useState, type ReactNode } from "react";
import { MutationCache, QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useLocale } from "next-intl";
import { ApiError } from "@/core/api/errorNormalizer";
import { setApiLocale } from "@/core/api/locale";
import { bootstrapSession } from "@/core/auth/session";
import { useUiStore } from "@/core/store/uiStore";
import type { Locale } from "@/core/i18n/routing";

declare module "@tanstack/react-query" {
  interface Register {
    mutationMeta: { silent?: boolean };
  }
}

const shouldRetry = (count: number, error: unknown) => {
  if (error instanceof ApiError && error.status !== 0 && error.status < 500) return false;
  return count < 2;
};

function makeQueryClient() {
  return new QueryClient({
    defaultOptions: { queries: { retry: shouldRetry, refetchOnWindowFocus: false, staleTime: 30_000 } },
    mutationCache: new MutationCache({
      // Todo error de mutación se muestra como banner con su correlation_id, salvo `meta.silent`.
      onError: (error, _vars, _ctx, mutation) => {
        if (mutation.meta?.silent) return;
        if (error instanceof ApiError) {
          if (error.status === 401) return; // sesión terminada: la UI redirige a login
          useUiStore.getState().push({ tone: "error", message: error.message, reference: error.correlationId });
        }
      },
    }),
  });
}

export function Providers({ children }: { children: ReactNode }) {
  const locale = useLocale() as Locale;
  const [client] = useState(makeQueryClient);

  // Accept-Language del cliente HTTP = locale activo de la URL (RF-11).
  setApiLocale(locale);

  useEffect(() => {
    void bootstrapSession();
  }, []);

  return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
}
