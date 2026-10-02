// VGRP-57 — POST /api/cotizador/analisis-marketing. Port de `api/analyze.js`
// (vegroup@b550803): análisis de marketing/comercialización posterior al
// cálculo de importación.
//
// Prompt, modelo (`claude-opus-4-8` o `ANTHROPIC_MODEL_ANALYZE`) y
// post-proceso copiados TEXTUALES. Igual que el original, este endpoint NO usa
// tool use: pide texto y lo parsea con `extraerJSON()` (el `extractJSON()`
// original), sin reintentos.
//
// Diferencia con el original: la respuesta se transmite en streaming (NDJSON,
// ver `EventoAnalisis`) para que la UI muestre el análisis mientras el modelo
// lo escribe, en vez de esperar ~20 s a que termine. Se espera el PRIMER
// fragmento antes de responder, así los errores de entrada (clave, API caída)
// siguen saliendo con su status HTTP; lo que falle después (JSON inválido, se
// corta la conexión) ya va dentro del 200, como evento `error`.
//
//   sin sesión ... 401    sin plan ... 403    falta producto ... 400
//   IA falla al arrancar / respuesta vacía ... 502
//   ok ........... 200 NDJSON: { tipo: "texto" }* y al final { tipo: "fin",
//                  analisis: { publicoObjetivo, angulosVenta[], ideasContenido[],
//                  campanaSugerida, precioSugerido, riesgoPrincipal } }
//                  o { tipo: "error", error }

import { z } from "zod";
import { type EventoAnalisis, normalizarAnalisis } from "@/lib/cotizador/analisis";
import { ErrorCotizador, extraerJSON, transmitirTexto } from "@/lib/cotizador/server/anthropic";
import { requierePlan } from "@/lib/cotizador/server/guard";
import { leerCuerpo, reportarError, responderError } from "@/lib/cotizador/server/respuestas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL_ANALYZE || "claude-opus-4-8";

// El front (MarketingAnalysis.jsx) manda `{ producto, ncm, costos:
// resumenCostos, mercado }`. `costos` es un objeto libre que sólo se
// serializa al prompt, así que no se tipa acá.
const bodySchema = z.object({
  producto: z
    .string({ error: "Falta el nombre del producto." })
    .min(1, "Falta el nombre del producto."),
  ncm: z.string().nullish(),
  costos: z.unknown().optional(),
  mercado: z.string().nullish(),
});

export async function POST(req: Request): Promise<Response> {
  const bloqueo = await requierePlan();
  if (bloqueo) return bloqueo;

  const body = await leerCuerpo(req, bodySchema);
  if (!body.ok) return body.response;
  const { producto, ncm, costos, mercado } = body.data;

  const system =
    "Sos un estratega de marketing y comercio para VEGROUP, empresa argentina de " +
    "logística e importación. Analizás productos importados para el mercado argentino " +
    "con criterio comercial realista (precios en USD y contexto local).";

  const prompt = [
    "Analizá comercialmente este producto importado por VEGROUP.",
    "",
    `Producto: ${producto}`,
    ncm ? `Posición NCM: ${ncm}` : "",
    costos ? `Resumen de costos (USD): ${JSON.stringify(costos)}` : "",
    mercado ? `Contexto adicional: ${mercado}` : "",
    "",
    "Devolvé UNICAMENTE un JSON con esta forma exacta:",
    "{",
    '  "publicoObjetivo": "<descripción del target ideal>",',
    '  "angulosVenta": ["<ángulo 1>", "<ángulo 2>", "<ángulo 3>"],',
    '  "ideasContenido": ["<idea 1>", "<idea 2>", "<idea 3>"],',
    '  "campanaSugerida": "<concepto de campaña en 1-2 frases>",',
    '  "precioSugerido": "<rango de precio de venta sugerido en ARS o USD con justificación breve>",',
    '  "riesgoPrincipal": "<el mayor riesgo comercial y cómo mitigarlo>"',
    "}",
    "Sé concreto y accionable. Sin texto fuera del JSON.",
  ]
    .filter(Boolean)
    .join("\n");

  const fragmentos = transmitirTexto(
    { model: MODEL, max_tokens: 1600, system, content: [{ type: "text", text: prompt }] },
    req.signal,
  );

  let primero: IteratorResult<string>;
  try {
    primero = await fragmentos.next();
  } catch (e) {
    return responderError(e, "analisisMarketing");
  }
  if (primero.done) {
    return responderError(
      new ErrorCotizador(502, "Respuesta vacía del modelo."),
      "analisisMarketing",
    );
  }

  return new Response(transmitirEventos(primero.value, fragmentos), {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "private, no-store",
    },
  });
}

/** Un evento por fragmento del modelo, y al final el análisis validado (o el error). */
function transmitirEventos(
  primero: string,
  resto: AsyncGenerator<string>,
): ReadableStream<Uint8Array> {
  const codificador = new TextEncoder();
  const linea = (evento: EventoAnalisis) => codificador.encode(`${JSON.stringify(evento)}\n`);
  let texto = primero;

  return new ReadableStream({
    start(controller) {
      controller.enqueue(linea({ tipo: "texto", texto: primero }));
    },
    async pull(controller) {
      try {
        const { value, done } = await resto.next();
        if (!done) {
          texto += value;
          controller.enqueue(linea({ tipo: "texto", texto: value }));
          return;
        }
        // El resultado definitivo es el de siempre: el texto completo, por
        // `extraerJSON()` y normalizado.
        controller.enqueue(
          linea({ tipo: "fin", analisis: normalizarAnalisis(extraerJSON(texto)) }),
        );
      } catch (e) {
        controller.enqueue(
          linea({ tipo: "error", error: reportarError(e, "analisisMarketing").mensaje }),
        );
      }
      controller.close();
    },
    async cancel() {
      // El usuario se fue: corta también la request a Anthropic.
      await resto.return(undefined);
    },
  });
}
