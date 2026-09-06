import "server-only";

import type { PreferenceRequest } from "mercadopago/dist/clients/preference/commonTypes";
import { getPrecios } from "../config";
import type { NivelAcceso } from "../database.types";
import { getEnv } from "../env";

/**
 * Armado PURO del body de la preferencia de Checkout Pro (VGRP-22).
 *
 * Separado a propósito del cliente del SDK (`lib/mercadopago/client.ts`) y de
 * la llamada de red (`app/(app)/comprar/_actions.ts`): esta función no hace
 * I/O de MercadoPago, sólo lee `getPrecios()` y arma un objeto. Eso permite
 * testear "¿el precio y los metadatos son los correctos?" mockeando
 * `getPrecios()`, sin pegarle a la API real ni mockear el SDK completo.
 *
 * ---------------------------------------------------------------------------
 * REGLA DURA (CLAUDE.md): el precio NUNCA se acepta desde el caller.
 * ---------------------------------------------------------------------------
 * La firma de `armarPreferencia` no recibe un precio como parámetro — sólo
 * `nivel` (para saber QUÉ precio buscar) y `userId` (para la trazabilidad de
 * la preferencia). El monto se resuelve enteramente acá adentro contra Edge
 * Config vía `getPrecios()`. Si en algún refactor futuro alguien agrega un
 * parámetro de precio a esta función, está reintroduciendo la superficie que
 * esta regla existe para cerrar.
 *
 * Fail-closed: si `getPrecios()` devuelve `{ ok: false }` (Edge Config caído,
 * o el valor no pasa el schema), esta función NO arma una preferencia con un
 * precio adivinado — devuelve `{ ok: false, error }` y el caller (el Server
 * Action) es quien decide qué mostrar. Nunca se lanza una excepción para este
 * caso: es un resultado esperable, no algo excepcional.
 */

export type NivelComprable = Exclude<NivelAcceso, "ninguno">;

const TITULOS_NIVEL: Record<NivelComprable, string> = {
  principiante: "Acceso Nivel Principiante — OG Circle",
  avanzado: "Acceso Nivel Avanzado — OG Circle",
};

export type ArmarPreferenciaResult =
  | { ok: true; preferenceData: PreferenceRequest }
  | { ok: false; error: string };

/**
 * Arma las `back_urls` absolutas del checkout. Las tres apuntan a rutas de
 * este mismo flujo de compra (nunca a un dominio externo): éxito y pendiente
 * van a la pantalla de espera (`/comprar/pendiente`, ver ese page.tsx — es
 * el webhook de VGRP-23, no esta redirección, quien de verdad confirma el
 * pago), y el fallo vuelve a la selección de nivel para reintentar.
 *
 * `nivel` viaja en la query como texto informativo para esa pantalla de
 * espera ("estás esperando la confirmación de tu compra de <nivel>") — nunca
 * como una señal de que el pago ya se acreditó.
 */
function armarBackUrls(nivel: NivelComprable): PreferenceRequest["back_urls"] {
  const siteUrl = getSiteUrl();
  const pendiente = `${siteUrl}/comprar/pendiente?nivel=${nivel}`;

  return {
    success: pendiente,
    pending: pendiente,
    failure: `${siteUrl}/comprar`,
  };
}

export async function armarPreferencia(
  nivel: NivelComprable,
  userId: string,
): Promise<ArmarPreferenciaResult> {
  const precios = await getPrecios();

  if (!precios.ok) {
    return { ok: false, error: precios.error };
  }

  const unitPrice = precios.precios[nivel];

  const preferenceData: PreferenceRequest = {
    items: [
      {
        id: nivel,
        title: TITULOS_NIVEL[nivel],
        quantity: 1,
        currency_id: "ARS",
        unit_price: unitPrice,
      },
    ],
    // Referencia para correlacionar la preferencia con el usuario que
    // compra: el webhook (VGRP-23) la lee de vuelta del pago notificado para
    // saber a quién proyectarle el nivel — no hay otra forma de asociar un
    // pago de MP con un usuario de este sistema.
    external_reference: userId,
    // `nivel` viaja en metadata (no sólo en external_reference) porque es el
    // dato que el webhook necesita para decidir QUÉ nivel activar — separar
    // "quién" (external_reference) de "qué" (metadata.nivel) evita tener que
    // parsear ningún string compuesto del lado del webhook.
    metadata: { nivel },
    back_urls: armarBackUrls(nivel),
    // Redirige automáticamente sin esperar el click de "Volver al sitio"
    // sólo cuando el pago fue aprobado. Ningún otro valor de `auto_return`
    // aplica acá — el PRD no contempla mostrar la pantalla de éxito de MP.
    auto_return: "approved",
  };

  return { ok: true, preferenceData };
}

/**
 * `NEXT_PUBLIC_SITE_URL` vía `getEnv()` (CLAUDE.md pide usar ese helper, no
 * leer `process.env` a mano) con un default de desarrollo: en este entorno
 * puede faltar en `.env.local` aunque esté documentada en `.env.example`, y
 * a diferencia de otras env vars de este módulo (el access token de MP,
 * donde faltar es un error real de configuración) no tiene sentido tirar
 * abajo el armado de la preferencia sólo porque no se seteó una URL de sitio
 * en desarrollo local — `getEnv()` no soporta un default nativo, así que se
 * atrapa acá el único caso en que "falta la env var" es esperable.
 *
 * Exportada (no sólo usada acá adentro) para que `_actions.ts` arme la URL
 * de éxito final con la misma resolución, sin duplicar el default.
 */
export function getSiteUrl(): string {
  try {
    return getEnv("NEXT_PUBLIC_SITE_URL");
  } catch {
    return "http://localhost:3000";
  }
}
