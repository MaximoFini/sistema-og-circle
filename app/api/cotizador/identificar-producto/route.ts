// VGRP-70 — POST /api/cotizador/identificar-producto. Endpoint propio (no
// viene del original): mira la foto de un producto y devuelve una descripción
// útil para clasificarlo en aduana, que el front pone en "Descripción del
// producto" del cotizador marítimo. Desde ahí sigue el flujo de siempre
// (búsqueda local → sugerir-partidas → identificar-ncm).
//
// Mismo patrón que extraer-documento: guard → body con zod → límite de 3 MB
// decodificados → IA. El front achica la foto antes de mandarla
// (lib/cotizador/achicarImagen.ts) y siempre manda JPEG.
//
// La foto no se guarda en ningún lado: sólo pasa por Anthropic.
//
//   sin sesión ... 401    sin plan ... 403
//   falta archivo / tipo no soportado ... 400
//   archivo > 3 MB ....................... 413
//   IA falla ............................. 502
//   ok ... 200 { producto, detalle, confianza, dudas }

import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { ProductoIdentificado } from "@/lib/cotizador/api";
import { llamarJSON } from "@/lib/cotizador/server/anthropic";
import { requierePlan } from "@/lib/cotizador/server/guard";
import { leerCuerpo, responderError } from "@/lib/cotizador/server/respuestas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL_EXTRACT || "claude-sonnet-5";

/** Límite del archivo DECODIFICADO, igual que extraer-documento. */
const MAX_BYTES = 3 * 1024 * 1024;

const TIPOS = ["image/jpeg", "image/png", "image/webp"] as const;

const FALTAN_DATOS = 'Enviá "fileBase64" y "mediaType".';

const bodySchema = z.object({
  fileBase64: z.string({ error: FALTAN_DATOS }).min(1, FALTAN_DATOS),
  mediaType: z
    .string({ error: FALTAN_DATOS })
    .min(1, FALTAN_DATOS)
    .pipe(z.enum(TIPOS, { error: "Formato no soportado. Usá una foto JPG, PNG o WebP." })),
});

const SCHEMA: Anthropic.Messages.Tool.InputSchema = {
  type: "object",
  properties: {
    producto: {
      type: "string",
      description: "Qué es, en pocas palabras y en español. Ej: 'taladro percutor eléctrico'.",
    },
    detalle: {
      type: "string",
      description:
        "Material, función, uso y composición: lo que importa para clasificarlo en aduana.",
    },
    confianza: {
      type: "integer",
      description: "0 a 100: qué tan seguro estás de qué producto es.",
    },
    dudas: {
      type: "string",
      description: "Qué no se ve en la foto y conviene aclarar. Vacío si no hay.",
    },
  },
  required: ["producto", "detalle", "confianza", "dudas"],
};

const SYSTEM =
  "Identificás mercadería a partir de fotos para clasificarla en el Nomenclador " +
  "Común del Mercosur (NCM). Describís QUÉ ES el producto: material, función, uso " +
  "y composición, que es lo que define la posición arancelaria. No describís la " +
  "marca, el color ni el fondo de la foto. Escribís en español, simple y concreto. " +
  "Si la foto no muestra un producto reconocible (un paisaje, una persona, una " +
  "foto borrosa), devolvés confianza menor a 30, explicás en dudas qué falta y " +
  "no inventás un producto.";

const INSTRUCCION =
  "¿Qué producto es este? Devolvé una descripción corta en 'producto', el detalle " +
  "para la aduana en 'detalle', tu confianza (0-100) y lo que no se ve en 'dudas'.";

// La forma de la respuesta vive en lib/cotizador/api.ts (`ProductoIdentificado`):
// un route.ts sólo exporta métodos y config de Next.
function normalizar(r: Record<string, unknown>): ProductoIdentificado {
  const texto = (v: unknown) => (typeof v === "string" ? v.trim() : "");
  const n = Number(r.confianza);
  return {
    producto: texto(r.producto),
    detalle: texto(r.detalle),
    confianza: Number.isFinite(n) ? Math.min(100, Math.max(0, Math.round(n))) : 0,
    dudas: texto(r.dudas),
  };
}

export async function POST(req: Request): Promise<Response> {
  const bloqueo = await requierePlan();
  if (bloqueo) return bloqueo;

  const body = await leerCuerpo(req, bodySchema);
  if (!body.ok) return body.response;
  const { fileBase64, mediaType } = body.data;

  if (Buffer.byteLength(fileBase64, "base64") > MAX_BYTES) {
    return Response.json(
      { error: "La foto supera el máximo de 3 MB. Probá con una más liviana." },
      { status: 413 },
    );
  }

  try {
    const r = await llamarJSON({
      model: MODEL,
      max_tokens: 800,
      system: SYSTEM,
      content: [
        { type: "image", source: { type: "base64", media_type: mediaType, data: fileBase64 } },
        { type: "text", text: INSTRUCCION },
      ],
      schema: SCHEMA,
    });
    return Response.json(normalizar(r));
  } catch (e) {
    return responderError(e, "identificarProducto");
  }
}
