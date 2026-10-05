import "server-only";

import * as Sentry from "@sentry/nextjs";
import type { ReactElement } from "react";
import { getFrom, getReplyTo, getResendClient } from "./client";

/**
 * Helper de envío de email (VGRP-25).
 *
 * ============================================================================
 * REGLA DURA: `enviarEmail()` NUNCA lanza. Nunca. Bajo ninguna falla.
 * ============================================================================
 *
 * Es criterio explícito del ticket y del PRD §5.2: *"el envío de email nunca
 * bloquea la respuesta del webhook"*. El caso que de verdad importa llega en el
 * Bloque 3, con el webhook de MercadoPago: si Resend está caído, se acabó la
 * cuota del plan, o la API key es inválida, **el pago igual se tiene que
 * procesar**. Un `throw` acá significaría que alguien pagó, se le acreditó el
 * acceso en la base, y el webhook devolvió 500 — con lo cual MercadoPago
 * reintenta y se duplica el procesamiento. El peor bug posible del sistema
 * (STACK.md §8) por no poder mandar un mail.
 *
 * Por eso la firma está diseñada para que sea IMPOSIBLE usarla mal:
 *
 * - Devuelve `Promise<ResultadoEnvio>`, un discriminated union `{ ok }`. No hay
 *   una variante que lance ni una versión "strict" del helper.
 * - La promesa nunca rechaza: todo el cuerpo está dentro de un `try/catch` que
 *   incluye la construcción del cliente, el render de la plantilla y el `await`
 *   de la llamada de red.
 * - Resend tiene DOS modos de falla distintos y los dos se aplanan al mismo
 *   resultado: (1) devuelve `{ error }` en el body para errores de la API
 *   (401, 422, rate limit) sin lanzar, y (2) lanza de verdad ante un fallo de
 *   red/DNS/timeout del `fetch` de abajo. Manejar solo uno de los dos es el
 *   error clásico con este SDK.
 *
 * El caller NO necesita envolver esto en un `try/catch`. Si lo hace, no está mal,
 * está de más.
 */

export type ResultadoEnvio = { ok: true; id: string | null } | { ok: false; error: string };

export interface ParametrosEnvio {
  /** Destinatario. Hoy, sin dominio verificado, Resend solo entrega a la casilla
   *  del dueño de la cuenta — cualquier otro `to` es aceptado y descartado. */
  para: string;
  asunto: string;
  /** Plantilla de React Email (ver `emails/`). Resend la renderiza a HTML y
   *  deriva el fallback de texto plano. */
  plantilla: ReactElement;
  /** Contexto para el log del fallo: qué disparó este email. Ej: "reset-password". */
  motivo: string;
}

/**
 * Punto de instrumentación de fallos de ENTREGA de email (único en el módulo).
 *
 * Un email transaccional que no sale es un fallo SILENCIOSO por definición: el
 * usuario no ve nada, el flujo sigue andando, y nadie se entera hasta que alguien
 * escribe "nunca me llegó el mail". Por eso va a Sentry (VGRP-41, STACK.md §8).
 *
 * Si Sentry no está inicializado (sin DSN), `captureException` es no-op: fail-open,
 * igual que el resto del repo. Si la propia llamada a Sentry lanza, también se
 * traga: reportar un fallo nunca puede romper `enviarEmail()`.
 */
export function reportarFalloDeEmail(motivo: string, error: unknown): void {
  const normalizado = error instanceof Error ? error : new Error(String(error));
  // Log de respaldo: sin SENTRY_DSN, Sentry es no-op y el fallo no deja rastro en ningún lado.
  console.error(`[email] fallo de envío (motivo=${motivo}): ${normalizado.message}`);
  try {
    Sentry.captureException(normalizado, { tags: { motivo } });
  } catch {
    // Sentry falló: no hay a dónde reportarlo y el envío igual tiene que devolver su resultado.
  }
}

export async function enviarEmail(params: ParametrosEnvio): Promise<ResultadoEnvio> {
  const { para, asunto, plantilla, motivo } = params;

  try {
    const resend = getResendClient();
    if (!resend) {
      // Caso normal hoy, no caso de borde: todavía no hay cuenta de Resend
      // configurada (docs/EMAIL.md). Se reporta igual para que no quede mudo.
      const error = "RESEND_API_KEY no está configurada; no se envió nada.";
      reportarFalloDeEmail(motivo, error);
      return { ok: false, error };
    }

    const replyTo = getReplyTo();
    const { data, error } = await resend.emails.send({
      from: getFrom(),
      to: para,
      subject: asunto,
      react: plantilla,
      ...(replyTo ? { replyTo } : {}),
    });

    // Modo de falla 1: la API respondió con error en el body, sin lanzar.
    if (error) {
      const mensaje = `${error.name}: ${error.message}`;
      reportarFalloDeEmail(motivo, mensaje);
      return { ok: false, error: mensaje };
    }

    return { ok: true, id: data?.id ?? null };
  } catch (error) {
    // Modo de falla 2: el `fetch` de abajo lanzó (red, DNS, timeout), o el render
    // de la plantilla explotó. Se aplana al mismo resultado y muere acá.
    reportarFalloDeEmail(motivo, error);
    return {
      ok: false,
      error: error instanceof Error ? error.message : "error desconocido al enviar el email",
    };
  }
}
