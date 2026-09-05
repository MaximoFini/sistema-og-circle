import "server-only";

import { MercadoPagoConfig, Payment, Preference } from "mercadopago";
import { getEnv } from "../env";

/**
 * Cliente del SDK oficial de Mercado Pago (VGRP-22).
 *
 * `MERCADOPAGO_ACCESS_TOKEN` es un secreto de servidor puro (permite crear
 * cobros a nombre de la cuenta) — por eso el `import "server-only"` de
 * arriba: si algún día alguien importa este módulo desde un Client
 * Component por error, el build de Next falla en vez de filtrar el token al
 * bundle del browser.
 *
 * No se cachea una única instancia de `MercadoPagoConfig`/`Preference` a
 * nivel de módulo a propósito: `getEnv()` lanza recién en el primer uso real
 * (cuando efectivamente hace falta el token), no al importar el archivo. Con
 * un singleton creado en el top-level, cualquier ruta que importe este
 * módulo por otra razón (tests, tooling) explotaría por un `MERCADOPAGO_ACCESS_TOKEN`
 * ausente aunque nunca llegue a llamar a la API. El costo de reconstruir el
 * objeto en cada request es despreciable (no abre conexión, sólo guarda el
 * token en memoria).
 */
export function getPreferenceClient(): Preference {
  const accessToken = getEnv(
    "MERCADOPAGO_ACCESS_TOKEN",
    "Necesario para crear preferencias de Checkout Pro (VGRP-22). Ver .env.example.",
  );
  const config = new MercadoPagoConfig({ accessToken });
  return new Preference(config);
}

/**
 * Cliente del SDK para CONSULTAR pagos (VGRP-23) — distinto de `Preference`
 * de arriba, que sólo crea preferencias de checkout. El webhook lo usa para
 * pedirle a la API de MP el estado REAL de un pago notificado (nunca confiar
 * en el body del webhook, que cualquiera puede falsear si la firma fallara).
 *
 * Mismo patrón que `getPreferenceClient()`: sin singleton a nivel de módulo,
 * por la misma razón (que `getEnv()` sólo explote en el primer uso real).
 */
export function getPaymentClient(): Payment {
  const accessToken = getEnv(
    "MERCADOPAGO_ACCESS_TOKEN",
    "Necesario para consultar pagos en el webhook de Mercado Pago (VGRP-23). Ver .env.example.",
  );
  const config = new MercadoPagoConfig({ accessToken });
  return new Payment(config);
}
