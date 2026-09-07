// VGRP-46 — helper de FIRMA (el inverso de la VALIDACIÓN) para los tests de
// integración del webhook de Mercado Pago.
//
// Por qué existe un archivo aparte en vez de hacer el HMAC a mano dentro de
// cada test: si cada test reimplementara el algoritmo de firma, terminaría
// validando su propia copia del algoritmo, no el de producción — si
// `validarFirmaMercadoPago` (lib/mercadopago/validarFirma.ts) tuviera un bug
// en cómo arma el manifest, un test que reconstruye el manifest de la misma
// forma equivocada seguiría pasando. Este helper reproduce el ÚNICO contrato
// que importa (el formato documentado por Mercado Pago, el mismo que describe
// el comentario de cabecera de validarFirma.ts) en un solo lugar, para que
// cualquier test de integración lo reutilice en vez de reinventarlo.
//
// `validarFirmaMercadoPago` no expone un "firmador" porque en producción
// nunca hace falta firmar, sólo validar — por eso este helper vive en test/,
// no en lib/.

import { createHmac } from "node:crypto";

export interface FirmarWebhookParams {
  /** El mismo `data.id` que va a ir en el query string de la URL. */
  dataId: string;
  /** El mismo valor que va a ir en el header `x-request-id`. */
  requestId: string;
  /** `MERCADOPAGO_WEBHOOK_SECRET` usado por el webhook bajo test. */
  secret: string;
  /** Timestamp del manifest. Default: ahora, en milisegundos. */
  ts?: number;
}

/**
 * Arma el header `x-signature` (`ts=<ts>,v1=<hash>`) válido para un
 * `dataId`/`requestId`/`secret` dados, con el mismo manifest
 * (`id:{dataId};request-id:{requestId};ts:{ts};`, `dataId` en minúscula) que
 * documenta `lib/mercadopago/validarFirma.ts`.
 */
export function firmarWebhookMercadoPago(params: FirmarWebhookParams): {
  xSignature: string;
  xRequestId: string;
} {
  const ts = params.ts ?? Date.now();
  const manifest = `id:${params.dataId.toLowerCase()};request-id:${params.requestId};ts:${ts};`;
  const hash = createHmac("sha256", params.secret).update(manifest).digest("hex");

  return {
    xSignature: `ts=${ts},v1=${hash}`,
    xRequestId: params.requestId,
  };
}
