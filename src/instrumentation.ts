/**
 * Se ejecuta una vez al arrancar el servidor Next. Con `API_MOCKING=enabled` levanta MSW para
 * interceptar las llamadas del BFF hacia el API Gateway (los backends aún están en desarrollo).
 * El navegador no necesita MSW: siempre habla con `/bff/...` del mismo origen.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === "nodejs" && process.env.API_MOCKING === "enabled") {
    const { server } = await import("@/mocks/node");
    server.listen({ onUnhandledFrame: "bypass" });
    console.info("[mocks] MSW activo: el API Gateway está simulado");
  }
}
