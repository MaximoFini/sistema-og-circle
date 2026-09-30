// VGRP-57 — POST /api/cotizador/analisis-marketing. Port de `api/analyze.js`
// (vegroup@b550803): análisis de marketing/comercialización posterior al
// cálculo de importación.
//
// Prompt, modelo (`claude-opus-4-8` o `ANTHROPIC_MODEL_ANALYZE`) y
// post-proceso copiados TEXTUALES. Igual que el original, este endpoint NO usa
// tool use: pide texto y lo parsea con `extraerJSON()` (el `extractJSON()`
// original), sin reintentos.
//
//   sin sesión ... 401    sin plan ... 403    falta producto ... 400
//   IA falla / JSON inválido ......... 502
//   ok ........... 200 { publicoObjetivo, angulosVenta[], ideasContenido[],
//                        campanaSugerida, precioSugerido, riesgoPrincipal }

import { z } from "zod";
import { extraerJSON, llamarTexto } from "@/lib/cotizador/server/anthropic";
import { requierePlan } from "@/lib/cotizador/server/guard";
import { leerCuerpo, responderError } from "@/lib/cotizador/server/respuestas";

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

  try {
    const text = await llamarTexto({
      model: MODEL,
      max_tokens: 1600,
      system,
      content: [{ type: "text", text: prompt }],
    });

    const parsed = extraerJSON(text);
    // Normalizamos arrays por si el modelo devolvió strings sueltos.
    parsed.angulosVenta = toArray(parsed.angulosVenta);
    parsed.ideasContenido = toArray(parsed.ideasContenido);
    return Response.json(parsed);
  } catch (e) {
    return responderError(e, "analisisMarketing");
  }
}

function toArray(v: unknown): unknown[] {
  if (Array.isArray(v)) return v.filter(Boolean);
  if (typeof v === "string" && v.trim()) return [v.trim()];
  return [];
}
