// VGRP-57 — POST /api/cotizador/identificar-ncm. Port de `api/identify.js`
// (vegroup@b550803): identifica la posición NCM correcta a partir de una
// descripción en lenguaje natural y una lista de candidatos que el front ya
// filtró de la base local.
//
// Prompt, schema de tool use, modelo y post-proceso copiados TEXTUALES del
// original, salvo la marca (VGRP-69: el system ya no nombra a VEGROUP); cambia
// la mecánica (SDK en vez de fetch, sesión real en vez del token propio de
// vegroup).
//
//   sin sesión ................. 401        sin plan .......... 403
//   falta query / candidatos ... 400        IA falla .......... 502
//   ok ......................... 200 { ncm, confianza, razonamiento, alternativas }

import { z } from "zod";
import { llamarJSON } from "@/lib/cotizador/server/anthropic";
import { requierePlan } from "@/lib/cotizador/server/guard";
import { leerCuerpo, responderError } from "@/lib/cotizador/server/respuestas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL_IDENTIFY || "claude-sonnet-5";

// El front manda `{ ncm: <SIM>, descripcion }` por candidato (ver
// AgentQuote.jsx del original: `candidates.map(c => ({ ncm: c.sim, descripcion }))`).
// Se aceptan campos extra, pero al prompt sólo llegan estos dos, como en el
// original. Hasta ~85 candidatos (locales + hasta 60 por partidas sugeridas);
// el tope de 200 es sólo contra payloads absurdos — el recorte real a 80 es
// el del original, más abajo.
const candidatoSchema = z.looseObject({
  ncm: z.string(),
  descripcion: z.string(),
});

const bodySchema = z.object({
  query: z.string({ error: 'Falta el parámetro "query".' }).min(1, 'Falta el parámetro "query".'),
  candidates: z
    .array(candidatoSchema, { error: "No se enviaron candidatos NCM para evaluar." })
    .min(1, "No se enviaron candidatos NCM para evaluar.")
    .max(200, "Demasiados candidatos NCM."),
});

export async function POST(req: Request): Promise<Response> {
  const bloqueo = await requierePlan();
  if (bloqueo) return bloqueo;

  const body = await leerCuerpo(req, bodySchema);
  if (!body.ok) return body.response;
  const { query, candidates } = body.data;

  // Limitamos y compactamos los candidatos para no inflar el prompt.
  const list = candidates.slice(0, 80).map((c) => ({
    ncm: c.ncm,
    descripcion: c.descripcion,
  }));

  const system =
    "Sos un clasificador experto en el Nomenclador Común del Mercosur (NCM) para " +
    "una empresa argentina de courier e importación de mercadería comercial. " +
    "Los usuarios escriben en jerga argentina: interpretá el término como el " +
    'producto comercial más habitual en ese contexto ("zapa" = zapatillas, ' +
    '"celu" = celular, "compu" = computadora). Elegís la posición arancelaria ' +
    "más adecuada SOLO entre los candidatos provistos. Nunca inventás códigos.";

  const prompt = [
    `Producto del usuario: "${query}"`,
    "",
    "Candidatos NCM (elegí exclusivamente de esta lista):",
    JSON.stringify(list, null, 2),
    "",
    "Devolvé UNICAMENTE un JSON con esta forma exacta:",
    "{",
    '  "ncm": "<código elegido, tal cual figura en los candidatos>",',
    '  "confianza": <entero 0-100>,',
    '  "razonamiento": "<1-2 frases explicando la elección>",',
    '  "alternativas": [',
    '    { "ncm": "<código>", "motivo": "<por qué podría aplicar>" }',
    "  ]",
    "}",
    "Incluí hasta 2 alternativas plausibles (o [] si no hay). Sin texto fuera del JSON.",
  ].join("\n");

  try {
    const parsed = await llamarJSON({
      model: MODEL,
      max_tokens: 1200,
      system,
      content: [{ type: "text", text: prompt }],
      schema: {
        type: "object",
        properties: {
          ncm: { type: "string", description: "Código elegido, tal cual figura en los candidatos" },
          confianza: { type: "integer", description: "Entero 0-100" },
          razonamiento: { type: "string", description: "1-2 frases explicando la elección" },
          alternativas: {
            type: "array",
            items: {
              type: "object",
              properties: {
                ncm: { type: "string" },
                motivo: { type: "string" },
              },
              required: ["ncm"],
            },
            description: "Hasta 2 alternativas plausibles ([] si no hay)",
          },
        },
        required: ["ncm", "confianza", "razonamiento", "alternativas"],
      },
    });

    // Validamos que el código elegido exista realmente en los candidatos.
    const valid = new Set(list.map((c) => c.ncm));
    if (!valid.has(parsed.ncm as string)) {
      // El modelo alucinó: caemos al primer candidato con baja confianza.
      parsed.ncm = list[0]?.ncm;
      parsed.confianza = Math.min((parsed.confianza as number | undefined) ?? 40, 40);
      parsed.razonamiento = `${parsed.razonamiento || ""} (Ajustado al mejor candidato local.)`;
    }
    parsed.confianza = clamp(Number(parsed.confianza) || 0, 0, 100);
    parsed.alternativas = Array.isArray(parsed.alternativas)
      ? parsed.alternativas
          .filter((a: unknown) => valid.has((a as { ncm?: string } | null)?.ncm as string))
          .slice(0, 3)
      : [];

    return Response.json(parsed);
  } catch (e) {
    return responderError(e, "identificarNcm");
  }
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}
