import "server-only";

import { Resend } from "resend";

/**
 * Cliente Resend centralizado (VGRP-25).
 *
 * Reglas de diseño de este módulo — son las mismas que las de `lib/config/index.ts`:
 * un módulo de infraestructura que puede estar mal configurado NO explota en el
 * camino caliente, devuelve un valor que el caller sabe interpretar.
 *
 * - `getResendClient()` devuelve `null` si falta `RESEND_API_KEY` en vez de lanzar.
 *   Hoy esa env var NO está seteada en ningún lado (no hay cuenta de Resend con
 *   dominio verificado todavía — ver `docs/EMAIL.md`), así que el caso "falta la
 *   key" es el caso NORMAL, no un caso de borde. Si esto lanzara, importar este
 *   módulo desde cualquier lado tiraría abajo el build o el request.
 * - El cliente se crea una sola vez por proceso (lambda) y se cachea. Resend es un
 *   wrapper de `fetch` sin estado ni conexión persistente, así que reusarlo es
 *   seguro y ahorra la construcción por request.
 *
 * Nadie fuera de `lib/email/` debería importar esto: el único punto de entrada
 * para mandar mails es `enviarEmail()` de `lib/email/send.ts`, que es el que
 * garantiza que nunca se propaga una excepción hacia el llamador.
 */

// Se cachea el cliente JUNTO CON la key con la que se construyó. Cachear solo el
// cliente haría que una rotación de `RESEND_API_KEY` en runtime (o un
// `vi.stubEnv` en un test) siguiera usando el cliente viejo con la key vieja.
let cached: { apiKey: string; client: Resend } | null = null;

export function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY;
  if (!apiKey) {
    return null;
  }
  if (!cached || cached.apiKey !== apiKey) {
    cached = { apiKey, client: new Resend(apiKey) };
  }
  return cached.client;
}

/**
 * Remitente por defecto de todos los emails transaccionales.
 *
 * ⚠️ `onboarding@resend.dev` es el remitente de PRUEBA de Resend: solo entrega a la
 * casilla del dueño de la cuenta de Resend, a nadie más. Es lo único que se puede
 * usar hasta que exista un dominio propio con SPF y DKIM verificados (el equipo
 * todavía no compró dominio: la landing vive en `vegroup.vercel.app`, un subdominio
 * de Vercel donde no se pueden crear registros DNS).
 *
 * El `from` y el `reply-to` definitivos son una DECISIÓN ABIERTA del equipo y
 * dependen del dominio que se compre — no están inventados acá a propósito. Ver
 * `docs/EMAIL.md` §"Pendiente de decidir".
 */
export const FROM_DE_PRUEBA = "OG Circle <onboarding@resend.dev>";

export function getFrom(): string {
  // `||` y no `??`: en `.env.example` la variable existe con valor vacío, y un
  // `from: ""` haría que Resend rechace absolutamente todos los envíos.
  return process.env.EMAIL_FROM || FROM_DE_PRUEBA;
}

export function getReplyTo(): string | undefined {
  // Vacío se trata como ausente: en `.env.example` la variable existe sin valor.
  return process.env.EMAIL_REPLY_TO || undefined;
}
