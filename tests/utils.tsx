import type { ReactElement } from "react";
import { render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import common from "../messages/es-CO/common.json";
import reservas from "../messages/es-CO/reservas.json";
import catalogo from "../messages/es-CO/catalogo.json";

export const messages = { common, reservas, catalogo };

/** Renderiza con next-intl (es-CO) y React Query para probar componentes de forma aislada. */
export function renderWithProviders(ui: ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <NextIntlClientProvider locale="es-CO" messages={messages}>
      <QueryClientProvider client={client}>{ui}</QueryClientProvider>
    </NextIntlClientProvider>,
  );
}
