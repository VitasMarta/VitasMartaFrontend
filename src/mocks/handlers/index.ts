import { catalogoHandlers } from "./catalogo";
import { identidadHandlers } from "./identidad";
import { institucionalHandlers } from "./institucional";
import { prestadoresHandlers } from "./prestadores";
import { reservasHandlers } from "./reservas";
import { sesionesHandlers } from "./sesiones";

/**
 * Simulación del API Gateway (M1) basada en los JSON de `contratos_de_consumo_api_del_frontend.md`.
 * Todas las rutas son `${GATEWAY_URL}/api/v1/...`. El orden importa: las rutas literales
 * (`/catalogo/busqueda`) van antes que las parametrizadas (`/catalogo/:id`).
 */
export const handlers = [
  ...sesionesHandlers,
  ...identidadHandlers,
  ...catalogoHandlers,
  ...reservasHandlers,
  ...prestadoresHandlers,
  ...institucionalHandlers,
];
