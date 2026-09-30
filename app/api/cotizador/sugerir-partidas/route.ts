// VGRP-57 — POST /api/cotizador/sugerir-partidas. Port de `api/suggest.js`
// (vegroup@b550803): fallback de búsqueda. Cuando la búsqueda textual local no
// encuentra candidatos, la IA sugiere las partidas NCM (4 dígitos) probables y
// el front junta todas las posiciones SIM de esas partidas como candidatos.
//
// Prompt, schema, modelo (el mismo `ANTHROPIC_MODEL_IDENTIFY` que identificar,
// como en el original) y los 2 intentos completos copiados TEXTUALES.
//
//   sin sesión ... 401    sin plan ... 403    falta query ... 400
//   IA falla / no sugiere nada ....... 502
//   ok ........... 200 { partidas: string[], interpretacion: string }

import { z } from "zod";
import { ErrorCotizador, llamarJSON } from "@/lib/cotizador/server/anthropic";
import { requierePlan } from "@/lib/cotizador/server/guard";
import { leerCuerpo, responderError } from "@/lib/cotizador/server/respuestas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL_IDENTIFY || "claude-sonnet-5";

const bodySchema = z.object({
  query: z.string({ error: 'Falta el parámetro "query".' }).min(1, 'Falta el parámetro "query".'),
});

export async function POST(req: Request): Promise<Response> {
  const bloqueo = await requierePlan();
  if (bloqueo) return bloqueo;

  const body = await leerCuerpo(req, bodySchema);
  if (!body.ok) return body.response;
  const { query } = body.data;

  const system =
    "Sos un clasificador experto en el Nomenclador Común del Mercosur (NCM) para " +
    "VEGROUP, una empresa argentina de courier e importación de mercadería " +
    "comercial (electrónica, indumentaria, calzado, accesorios, hogar, etc.). " +
    "Los usuarios escriben en jerga argentina, abreviado o mal escrito: primero " +
    "interpretás QUÉ PRODUCTO COMERCIAL es realmente, priorizando la lectura más " +
    'común en ese contexto de importación. Ejemplos: "zapa"/"zapas" = zapatillas ' +
    '(calzado deportivo), "compu" = computadora, "celu" = teléfono celular, ' +
    '"campera" = cazadora, "joya" = bijouterie/joyería. Recién después indicás ' +
    "las partidas de 4 dígitos donde puede clasificar.";

  const prompt = [
    `Producto: "${query}"`,
    "",
    "Devolvé UNICAMENTE un JSON con esta forma exacta:",
    '{ "interpretacion": "<qué es el producto, 2-5 palabras>", "partidas": ["6404", "6402"] }',
    "Hasta 6 partidas de 4 dígitos, ordenadas de más a menos probable.",
    "Sin texto fuera del JSON.",
  ].join("\n");

  const schema = {
    type: "object" as const,
    properties: {
      interpretacion: {
        type: "string",
        description: "Qué producto comercial es realmente, en 2-5 palabras",
      },
      partidas: {
        type: "array",
        items: { type: "string", description: 'Partida NCM de 4 dígitos, ej "6404"' },
        description: "Hasta 6 partidas de 4 dígitos, de más a menos probable",
      },
    },
    required: ["interpretacion", "partidas"],
  };

  try {
    // Hasta 2 intentos completos: nunca fallar por una respuesta incompleta aislada.
    let partidas: string[] = [];
    let parsed: Record<string, unknown> | null = null;
    for (let intento = 0; intento < 2 && partidas.length === 0; intento++) {
      parsed = await llamarJSON({
        model: MODEL,
        max_tokens: 800,
        system,
        content: [{ type: "text", text: prompt }],
        schema,
      });
      partidas = Array.isArray(parsed?.partidas)
        ? parsed.partidas
            .map((p: unknown) => String(p).replace(/\D/g, "").slice(0, 4))
            .filter((p: string) => /^\d{4}$/.test(p))
            .slice(0, 6)
        : [];
    }
    if (partidas.length === 0) {
      throw new ErrorCotizador(502, "La IA no pudo sugerir partidas para ese producto.");
    }
    return Response.json({
      partidas,
      interpretacion:
        typeof parsed?.interpretacion === "string" ? parsed.interpretacion.slice(0, 120) : "",
    });
  } catch (e) {
    return responderError(e, "sugerirPartidas");
  }
}
