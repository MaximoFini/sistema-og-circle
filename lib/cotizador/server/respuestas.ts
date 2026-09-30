// VGRP-57 — piezas comunes de los Route Handlers de `/api/cotizador/*`: leer
// el body JSON y traducir errores a respuestas. Reemplaza al `handler()` de
// `api/_anthropic.js` del original (el chequeo de método lo hace Next solo:
// cada route.ts exporta sólo `POST`, cualquier otro método es 405).

import "server-only";
import * as Sentry from "@sentry/nextjs";
import { NextResponse } from "next/server";
import type { z } from "zod";
import { ErrorCotizador } from "./anthropic";

/**
 * Valida el body contra `schema`. Body ausente o que no es JSON cuenta como
 * `{}` (el original hacía `JSON.parse(req.body || '{}')`), así el mensaje de
 * 400 es el del campo faltante y no uno genérico de "JSON inválido".
 *
 * En error devuelve la respuesta 400 con el mensaje del PRIMER problema —
 * los schemas de cada endpoint llevan como mensaje el texto literal del
 * original, que es lo que la UI portada muestra.
 */
export async function leerCuerpo<T extends z.ZodType>(
  req: Request,
  schema: T,
): Promise<{ ok: true; data: z.output<T> } | { ok: false; response: NextResponse }> {
  const raw = await req.json().catch(() => ({}));
  const parsed = schema.safeParse(raw ?? {});
  if (!parsed.success) {
    const mensaje = parsed.error.issues[0]?.message ?? "Datos inválidos.";
    return { ok: false, response: NextResponse.json({ error: mensaje }, { status: 400 }) };
  }
  return { ok: true, data: parsed.data };
}

/**
 * Error → respuesta. Todo va a Sentry (con `detalle` para ubicarlo); al
 * cliente sólo llega el mensaje de un `ErrorCotizador` (textos del original,
 * sin el detalle crudo de la API externa, que viaja en `cause`) o un 500
 * genérico — mismo criterio que `/api/agentes`.
 */
export function responderError(e: unknown, detalle: string): NextResponse {
  Sentry.captureException(e, { extra: { detalle } });
  if (e instanceof ErrorCotizador) {
    return NextResponse.json({ error: e.message }, { status: e.status });
  }
  return NextResponse.json({ error: "Error interno." }, { status: 500 });
}
