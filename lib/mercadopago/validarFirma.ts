import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Validación de firma HMAC del webhook de Mercado Pago (VGRP-23).
 *
 * ============================================================================
 * Por qué esto se escribe a mano y no con `standardwebhooks`
 * ============================================================================
 * El repo ya tiene la librería `standardwebhooks` instalada (la usa el Send
 * Email Hook de Supabase en `app/api/auth/send-email/route.tsx`), pero
 * Standard Webhooks es un esquema de firma DISTINTO al que usa Mercado Pago
 * (headers `webhook-id`/`webhook-timestamp`/`webhook-signature` vs. el
 * `x-signature`/`x-request-id` propietario de MP, con un manifest armado a
 * partir de partes de la URL). No son intercambiables.
 *
 * ============================================================================
 * El algoritmo (documentado por Mercado Pago)
 * ============================================================================
 * 1. El header `x-signature` trae `ts=<timestamp>,v1=<hash_hex>` — se parsean
 *    ambos valores.
 * 2. Se arma el manifest: el string literal
 *    `id:{data.id};request-id:{x-request-id};ts:{ts};`
 *    con los valores reales interpolados. `data.id` viene del query string de
 *    la URL de notificación (no del body) y se pasa a minúscula antes de
 *    interpolar (en la práctica siempre es numérico, pero MP lo pide igual).
 * 3. Se calcula HMAC-SHA256 del manifest con `MERCADOPAGO_WEBHOOK_SECRET`
 *    como clave, y se compara el resultado contra `v1` en tiempo constante.
 */

export interface FirmaMercadoPagoParams {
  /** Valor crudo del header `x-signature` (`ts=...,v1=...`). */
  xSignature: string | null;
  /** Valor crudo del header `x-request-id`. */
  xRequestId: string | null;
  /** `data.id` tomado del QUERY STRING de la URL de notificación. */
  dataId: string | null;
  /** `MERCADOPAGO_WEBHOOK_SECRET`. */
  secret: string;
}

/**
 * Parsea el header `x-signature` de MP: `ts=<timestamp>,v1=<hash_hex>`
 * (valores separados por coma, cada uno `clave=valor`). Devuelve `null` si
 * falta cualquiera de las dos claves — un header con forma inesperada se
 * trata como ausente, no se intenta adivinar.
 */
function parsearXSignature(xSignature: string): { ts: string; v1: string } | null {
  const partes = xSignature.split(",");
  let ts: string | null = null;
  let v1: string | null = null;

  for (const parte of partes) {
    const separadorIdx = parte.indexOf("=");
    if (separadorIdx === -1) continue;
    const clave = parte.slice(0, separadorIdx).trim();
    const valor = parte.slice(separadorIdx + 1).trim();
    if (clave === "ts") ts = valor;
    if (clave === "v1") v1 = valor;
  }

  if (!ts || !v1) return null;
  return { ts, v1 };
}

/**
 * Compara dos hex strings en tiempo constante. Si los largos difieren se
 * trata directamente como inválido SIN llamar a `timingSafeEqual` — esa
 * función lanza si los buffers no tienen el mismo largo, y dejarla explotar
 * acá convertiría un simple "no matchea" en una excepción no controlada.
 */
function compararHexEnTiempoConstante(a: string, b: string): boolean {
  const bufferA = Buffer.from(a, "hex");
  const bufferB = Buffer.from(b, "hex");
  if (bufferA.length !== bufferB.length) return false;
  return timingSafeEqual(bufferA, bufferB);
}

/**
 * Valida la firma HMAC de una notificación del webhook de Mercado Pago.
 *
 * Devuelve `true` sólo si TODOS los headers requeridos están presentes, el
 * `x-signature` tiene la forma esperada, y el hash calculado matchea `v1` en
 * tiempo constante. Cualquier otro caso (header ausente, forma inválida,
 * hash que no matchea) devuelve `false` — el caller (el Route Handler) es
 * quien decide responder 401.
 *
 * Punto de enganche para VGRP-41 (observabilidad): esta función es pura y no
 * loguea nada por sí misma — el caller decide qué detalle registrar ante un
 * `false`.
 */
export function validarFirmaMercadoPago(params: FirmaMercadoPagoParams): boolean {
  const { xSignature, xRequestId, dataId, secret } = params;

  if (!xSignature || !xRequestId || !dataId) return false;

  const parseado = parsearXSignature(xSignature);
  if (!parseado) return false;

  const manifest = `id:${dataId.toLowerCase()};request-id:${xRequestId};ts:${parseado.ts};`;
  const hashCalculado = createHmac("sha256", secret).update(manifest).digest("hex");

  return compararHexEnTiempoConstante(hashCalculado, parseado.v1);
}
