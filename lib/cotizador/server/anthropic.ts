// VGRP-57 — cliente de Anthropic de la calculadora. Port de `api/_anthropic.js`
// de vegroup@b550803 (ver lib/cotizador/ORIGEN.md): mismo comportamiento que
// `callAnthropic` / `callAnthropicJSON` / `extractJSON`, cambiando SÓLO la
// mecánica — `fetch` crudo → `@anthropic-ai/sdk`, y errores tipados con las
// clases del SDK en vez de mirar `resp.status` a mano.
//
// "server-only": acá se lee ANTHROPIC_API_KEY. Un import accidental desde un
// componente de cliente rompe el build en vez de colar la clave al bundle
// (test/structural/server-only-boundary.test.ts lo verifica).
//
// Reintentos: el cliente se arma con `maxRetries: 0` A PROPÓSITO. El original
// no tenía reintentos de transporte, sólo el loop de 3 intentos de
// `callAnthropicJSON`; si dejáramos los 2 reintentos default del SDK además
// de ese loop, un 529 sostenido serían 9 requests en vez de 3 — y con
// `maxDuration = 60` eso termina en timeout de la función, no en un 502.

import "server-only";
import Anthropic, { APIConnectionError, APIError, AuthenticationError } from "@anthropic-ai/sdk";
import { getEnv } from "@/lib/env";

/**
 * Error con status HTTP y mensaje apto para mostrarle al usuario — el
 * `HttpError` del original. Los Route Handlers lo traducen tal cual a la
 * respuesta; cualquier otro error es un 500 genérico.
 *
 * Diferencia deliberada con el original: el mensaje NUNCA lleva el detalle
 * crudo de la API de Anthropic (el original concatenaba hasta 200 caracteres
 * del body de error). Ese detalle viaja en `cause`, que va a Sentry y no al
 * cliente — mismo criterio que `/api/agentes`.
 */
export class ErrorCotizador extends Error {
  readonly status: number;

  constructor(status: number, message: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "ErrorCotizador";
    this.status = status;
  }
}

type Contenido = Anthropic.Messages.ContentBlockParam[];

interface OpcionesLlamada {
  model: string;
  max_tokens: number;
  system?: string;
  /** Bloques de contenido del mensaje del usuario. */
  content: Contenido;
}

interface OpcionesLlamadaJSON extends OpcionesLlamada {
  schema?: Anthropic.Messages.Tool.InputSchema;
}

/** Se arma en el primer uso real, no al importar: `getEnv()` lanza recién
 *  ahí si falta la clave (mismo criterio que lib/mercadopago/client.ts). */
function crearCliente(): Anthropic {
  let apiKey: string;
  try {
    apiKey = getEnv("ANTHROPIC_API_KEY", "(calculadora — ver .env.example)");
  } catch (e) {
    // Original: `HttpError(500, 'Falta ANTHROPIC_API_KEY…')`. Es config del
    // servidor: 500, y el loop de abajo no reintenta.
    throw new ErrorCotizador(500, "Error de configuración del servidor.", { cause: e });
  }
  return new Anthropic({ apiKey, maxRetries: 0 });
}

/** `rawCall()` del original: una request, y los errores de la API pasados a
 *  `ErrorCotizador` con el mismo mapeo de status (401 → 500, resto → 502). */
async function llamadaCruda(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Messages.Message> {
  const client = crearCliente();
  try {
    return await client.messages.create(params);
  } catch (e) {
    if (e instanceof AuthenticationError) {
      // Clave inválida: problema de config, no de la IA. El original lo
      // mapeaba a 500 para que el loop no reintente.
      throw new ErrorCotizador(500, "Error de configuración del servidor.", { cause: e });
    }
    if (e instanceof APIConnectionError) {
      // En el original un `fetch` que tiraba no era HttpError → 500 con el
      // mensaje crudo. Acá se trata como falla del servicio externo (502).
      throw new ErrorCotizador(502, "No se pudo contactar a la API de Anthropic.", { cause: e });
    }
    if (e instanceof APIError) {
      throw new ErrorCotizador(502, `Error de la API de Anthropic (${e.status}).`, { cause: e });
    }
    throw e;
  }
}

/**
 * `callAnthropic()` del original: texto plano concatenado de la respuesta.
 * Sin reintentos (el original tampoco tenía).
 */
export async function llamarTexto({
  model,
  max_tokens,
  system,
  content,
}: OpcionesLlamada): Promise<string> {
  const data = await llamadaCruda({
    model,
    max_tokens,
    ...(system ? { system } : {}),
    messages: [{ role: "user", content }],
  });
  const text = data.content
    .filter((b): b is Anthropic.Messages.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();

  if (!text) throw new ErrorCotizador(502, "Respuesta vacía del modelo.");
  return text;
}

/**
 * `callAnthropicJSON()` del original: fuerza la respuesta vía tool use
 * (`tool_choice` obligatorio a `emitir_resultado`), así el modelo no puede
 * devolver texto vacío ni JSON cortado. Hasta `reintentos` intentos ante
 * cualquier error, salvo los de config (500), que reintentar no arregla.
 */
export async function llamarJSON(
  { model, max_tokens, system, content, schema }: OpcionesLlamadaJSON,
  reintentos = 3,
): Promise<Record<string, unknown>> {
  let ultimoError: unknown;
  for (let i = 0; i < reintentos; i++) {
    try {
      const data = await llamadaCruda({
        model,
        max_tokens,
        ...(system ? { system } : {}),
        messages: [{ role: "user", content }],
        tools: [
          {
            name: "emitir_resultado",
            description: "Emite el resultado estructurado pedido en la consigna.",
            input_schema: schema || { type: "object" },
          },
        ],
        tool_choice: { type: "tool", name: "emitir_resultado" },
      });
      const block = data.content.find(
        (b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use",
      );
      if (!block || typeof block.input !== "object" || block.input === null) {
        throw new ErrorCotizador(502, "El modelo no devolvió el resultado estructurado.");
      }
      return block.input as Record<string, unknown>;
    } catch (err) {
      ultimoError = err;
      // Config del servidor (falta API key / clave inválida): reintentar no ayuda.
      if (err instanceof ErrorCotizador && err.status === 500) throw err;
    }
  }
  throw ultimoError;
}

/** `extractJSON()` del original, literal: primer objeto/array JSON dentro de
 *  un texto (tolera fences ```json y texto alrededor). */
export function extraerJSON(text: string): Record<string, unknown> {
  let t = text.trim();
  // Quitar fences ```json ... ```
  t = t
    .replace(/^```(?:json)?/i, "")
    .replace(/```$/i, "")
    .trim();
  try {
    return JSON.parse(t);
  } catch {
    // Buscar el primer bloque { ... } o [ ... ] balanceado.
    const start = t.search(/[{[]/);
    if (start === -1) throw new ErrorCotizador(502, "El modelo no devolvió JSON válido.");
    const open = t[start];
    const close = open === "{" ? "}" : "]";
    let depth = 0;
    for (let i = start; i < t.length; i++) {
      if (t[i] === open) depth++;
      else if (t[i] === close) {
        depth--;
        if (depth === 0) {
          try {
            return JSON.parse(t.slice(start, i + 1));
          } catch {
            break;
          }
        }
      }
    }
    throw new ErrorCotizador(502, "El modelo no devolvió JSON válido.");
  }
}
