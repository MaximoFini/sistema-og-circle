// VGRP-57 — POST /api/cotizador/extraer-documento. Port de `api/extract.js`
// (vegroup@b550803): extrae datos estructurados de una proforma / packing list
// (imagen o PDF). Espera `{ fileBase64, mediaType, filename }`.
//
// Prompt, modelo (`ANTHROPIC_MODEL_EXTRACT`) y post-proceso copiados
// TEXTUALES. Igual que el original, NO usa tool use: pide texto y lo parsea
// con `extraerJSON()`, sin reintentos.
//
// Dos desvíos deliberados del original:
// - Tipos: sólo JPG, PNG, WebP, GIF y PDF (el original dejaba pasar cualquier
//   `image/*`, que Anthropic después rechazaba con un 502 menos claro). Son
//   exactamente los `ACCEPTED` de ProformaUpload.jsx.
// - Tamaño: 413 si el archivo DECODIFICADO pasa de 3 MB (US-4). El original
//   anunciaba 8 MB, pero en base64 eso son ~10,7 MB de body y el límite de
//   request de las funciones de Vercel es 4,5 MB: nunca funcionó. 3 MB
//   decodificados son ~4 MB en base64, que sí entran.
//
//   sin sesión ... 401    sin plan ... 403
//   falta archivo / tipo no soportado ... 400
//   archivo > 3 MB ....................... 413
//   IA falla / JSON inválido ............. 502
//   ok ... 200 { producto, proveedor, direccionFabricante, origen, incoterm,
//                fob, pesoKg, volumenM3, cajas, unidades,
//                dimensiones: { largo, ancho, alto }, notas }

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { extraerJSON, llamarTexto } from "@/lib/cotizador/server/anthropic";
import { requierePlan } from "@/lib/cotizador/server/guard";
import { leerCuerpo, responderError } from "@/lib/cotizador/server/respuestas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL_EXTRACT || "claude-sonnet-5";

/** Límite del archivo DECODIFICADO (no del string base64). No se exporta:
 *  Next sólo admite exports de config/métodos en un route.ts. */
const MAX_BYTES = 3 * 1024 * 1024;

const TIPOS_IMAGEN = ["image/jpeg", "image/png", "image/webp", "image/gif"] as const;
const TIPOS = [...TIPOS_IMAGEN, "application/pdf"] as const;

const FALTAN_DATOS = 'Enviá "fileBase64" y "mediaType".';

const bodySchema = z.object({
  fileBase64: z.string({ error: FALTAN_DATOS }).min(1, FALTAN_DATOS),
  mediaType: z
    .string({ error: FALTAN_DATOS })
    .min(1, FALTAN_DATOS)
    .pipe(
      z.enum(TIPOS, {
        error: "Formato no soportado. Usá una imagen (JPG, PNG, WebP o GIF) o un PDF.",
      }),
    ),
  // El front lo manda (lo usa para el mensaje de éxito); el original lo ignora.
  filename: z.string().nullish(),
});

export async function POST(req: Request): Promise<Response> {
  const bloqueo = await requierePlan();
  if (bloqueo) return bloqueo;

  const body = await leerCuerpo(req, bodySchema);
  if (!body.ok) return body.response;
  const { fileBase64, mediaType } = body.data;

  if (Buffer.byteLength(fileBase64, "base64") > MAX_BYTES) {
    return Response.json(
      { error: "El archivo supera el máximo de 3 MB. Subí uno más liviano." },
      { status: 413 },
    );
  }

  const docBlock: Anthropic.Messages.ContentBlockParam =
    mediaType === "application/pdf"
      ? {
          type: "document",
          source: { type: "base64", media_type: "application/pdf", data: fileBase64 },
        }
      : {
          type: "image",
          source: { type: "base64", media_type: mediaType, data: fileBase64 },
        };

  const system =
    "Extraés datos de proformas y packing lists de importación. Devolvés SIEMPRE " +
    "números en punto (no coma) y en las unidades pedidas. Si un dato no aparece, " +
    "ponés null. No inventás valores.";

  const instruction = [
    "Leé este documento de importación (proforma / packing list) y extraé los datos.",
    "",
    "Devolvé UNICAMENTE un JSON con esta forma exacta:",
    "{",
    '  "producto": "<descripción principal de la mercadería>",',
    '  "proveedor": "<nombre del exportador/proveedor o null>",',
    '  "direccionFabricante": "<dirección completa del fabricante/exportador o null>",',
    '  "origen": "<país/ciudad de origen o null>",',
    '  "incoterm": "<FOB/CIF/EXW... o null>",',
    '  "fob": <valor FOB total en USD o null>,',
    '  "pesoKg": <peso bruto total en kg o null>,',
    '  "volumenM3": <volumen total en metros cúbicos o null>,',
    '  "cajas": <cantidad de cajas/bultos o null>,',
    '  "unidades": <cantidad total de unidades o null>,',
    '  "dimensiones": { "largo": <cm o null>, "ancho": <cm o null>, "alto": <cm o null> },',
    '  "notas": "<cualquier observación relevante o null>"',
    "}",
    "Convertí dimensiones a centímetros.",
    'Para "volumenM3": los packing lists suelen traerlo como CBM, M3, MEAS o',
    "MEASUREMENT — tomá el TOTAL del embarque, no el de una caja. Si no figura",
    "pero están las dimensiones y la cantidad de cajas, calculalo. Si no se",
    "puede, null.",
    'Para "direccionFabricante": la del exportador/shipper, tal como aparece,',
    "incluyendo ciudad y provincia — se usa para elegir el puerto de carga.",
    "Sin texto fuera del JSON.",
  ].join("\n");

  try {
    const text = await llamarTexto({
      model: MODEL,
      max_tokens: 1200,
      system,
      content: [docBlock, { type: "text", text: instruction }],
    });

    const parsed = extraerJSON(text);
    if (!parsed.dimensiones || typeof parsed.dimensiones !== "object") {
      parsed.dimensiones = { largo: null, ancho: null, alto: null };
    }
    return Response.json(parsed);
  } catch (e) {
    return responderError(e, "extraerDocumento");
  }
}
