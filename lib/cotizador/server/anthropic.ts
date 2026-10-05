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

/** Errores de la API pasados a `ErrorCotizador` con el mismo mapeo de status
 *  que `rawCall()` del original (401 → 500, resto → 502). */
function traducirError(e: unknown): unknown {
  if (e instanceof AuthenticationError) {
    // Clave inválida: problema de config, no de la IA. El original lo
    // mapeaba a 500 para que el loop no reintente.
    return new ErrorCotizador(500, "Error de configuración del servidor.", { cause: e });
  }
  if (e instanceof APIConnectionError) {
    // En el original un `fetch` que tiraba no era HttpError → 500 con el
    // mensaje crudo. Acá se trata como falla del servicio externo (502).
    return new ErrorCotizador(502, "No se pudo contactar a la API de Anthropic.", { cause: e });
  }
  if (e instanceof APIError) {
    return new ErrorCotizador(502, `Error de la API de Anthropic (${e.status}).`, { cause: e });
  }
  return e;
}

/**
 * B12-09 (VGRP-69): thinking apagado en todas las llamadas. `claude-sonnet-5`
 * corre con thinking adaptativo si no se manda el parámetro, y ese thinking
 * sale del mismo `max_tokens` (800–1600 acá, los del original): la respuesta
 * podía cortarse antes del `tool_use` o del JSON y dar un 502 intermitente.
 * Son tareas cortas y de formato fijo, y `tool_choice` forzado tampoco convive
 * con el thinking.
 *
 * Ojo si se cambia el modelo por env: Sonnet 5.5 y Opus 5.5 rechazan con 400
 * tanto `{ type: "disabled" }` como el `tool_choice` forzado de `llamarJSON()`.
 * Los defaults (`claude-sonnet-5`, `claude-opus-4-8`) aceptan los dos.
 */
const SIN_THINKING = { type: "disabled" } as const;

/** `rawCall()` del original: una request. */
async function llamadaCruda(
  params: Anthropic.Messages.MessageCreateParamsNonStreaming,
): Promise<Anthropic.Messages.Message> {
  const client = crearCliente();
  try {
    return await client.messages.create({ ...params, thinking: SIN_THINKING });
  } catch (e) {
    throw traducirError(e);
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
 * Como `llamarTexto()`, pero en streaming: cada fragmento de texto a medida
 * que el modelo lo escribe. Mismo mapeo de errores y sin reintentos. Los
 * errores de conexión o de la API salen del primer `next()` (no hay que
 * esperar al final para enterarse); `signal` corta la request a Anthropic
 * —p. ej. con el `req.signal` del Route Handler, si el usuario se va.
 */
export async function* transmitirTexto(
  { model, max_tokens, system, content }: OpcionesLlamada,
  signal?: AbortSignal,
): AsyncGenerator<string> {
  const stream = crearCliente().messages.stream(
    {
      model,
      max_tokens,
      thinking: SIN_THINKING,
      ...(system ? { system } : {}),
      messages: [{ role: "user", content }],
    },
    { signal },
  );
  let terminado = false;
  try {
    for await (const evento of stream) {
      if (evento.type === "content_block_delta" && evento.delta.type === "text_delta") {
        yield evento.delta.text;
      }
    }
    terminado = true;
  } catch (e) {
    throw traducirError(e);
  } finally {
    // Quien consume cortó antes del final (canceló la respuesta): no seguir
    // pagando tokens que nadie va a leer.
    if (!terminado) stream.abort();
  }
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
