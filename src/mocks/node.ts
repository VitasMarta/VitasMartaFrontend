import { setupServer } from "msw/node";
import { handlers } from "./handlers";

/** Servidor MSW para Node: lo usan el servidor Next (instrumentation) y Vitest. */
export const server = setupServer(...handlers);
