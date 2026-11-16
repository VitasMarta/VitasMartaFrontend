import { api } from "./gatewayClient";
import { routes } from "./routes";

export type OperacionReserva = "iniciar" | "confirmar" | "rechazar" | "cancelar" | "modificar";

/**
 * M3: el frontend NO inventa la clave; se la pide a M3 antes de ejecutar la acción
 * (`POST /reservas/claves-idempotencia`, CTR-M3-IN-01).
 */
export async function requestReservaKey(operacion: OperacionReserva, reservaRef: string | null): Promise<string> {
  const { data } = await api.post<{ clave_idempotencia: string }>(routes.reservas.claves, {
    body: { operacion, reserva_ref: reservaRef },
  });
  return data.clave_idempotencia;
}

/** M4: la clave es un UUID v4 generado por el cliente. */
export const newClientKey = (): string => crypto.randomUUID();

/**
 * Guarda la clave de una intención para reutilizarla si el usuario reintenta tras un corte de red:
 * M3 devuelve la reserva ya creada sin descontar cupos dos veces (§3.4 paso 3).
 * La clave se descarta al tener éxito o cuando cambia el contenido de la intención.
 */
export class IntentKeyCache {
  private fingerprint: string | null = null;
  private key: string | null = null;

  async get(fingerprint: string, create: () => Promise<string> | string): Promise<string> {
    if (this.key && this.fingerprint === fingerprint) return this.key;
    this.key = await create();
    this.fingerprint = fingerprint;
    return this.key;
  }

  reset() {
    this.key = null;
    this.fingerprint = null;
  }
}
