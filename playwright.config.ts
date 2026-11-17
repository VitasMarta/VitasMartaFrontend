import { defineConfig, devices } from "@playwright/test";

/**
 * E2E contra el build de producción (`pnpm build` previo) para tiempos estables. El API Gateway se
 * simula con MSW en el servidor de Next (API_MOCKING=enabled). Puerto 3100 para no chocar con el 3000.
 */
export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: true,
  workers: 2,
  timeout: 45_000,
  reporter: [["list"], ["html", { open: "never" }]],
  use: { baseURL: "http://localhost:3100", trace: "on-first-retry" },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
  webServer: {
    command: "pnpm start --port 3100",
    url: "http://localhost:3100/es-CO",
    reuseExistingServer: false,
    timeout: 60_000,
    env: { API_MOCKING: "enabled", NEXT_PUBLIC_GATEWAY_URL: "http://localhost:8080" },
  },
});
