import "@testing-library/jest-dom/vitest";
import { afterAll, afterEach, beforeAll, expect } from "vitest";
import { cleanup } from "@testing-library/react";
import { toHaveNoViolations } from "jest-axe";
import { server } from "@/mocks/node";

expect.extend(toHaveNoViolations);

// MSW simula el API Gateway también en las pruebas. Cualquier petición sin mock hace fallar el test.
beforeAll(() => server.listen({ onUnhandledFrame: "error" }));
afterEach(() => {
  server.resetHandlers();
  cleanup();
});
afterAll(() => server.close());
