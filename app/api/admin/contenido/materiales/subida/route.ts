// =============================================================================
// /api/admin/contenido/materiales/subida (VGRP-88) — la subida de un archivo NO pasa por
// acá: el navegador del admin sube directo a Storage (un archivo de 50 MB no entra en el
// body de una Server Action ni de un route handler de Vercel). Esta ruta solo autoriza.
//
// POST   { nombreArchivo, tamanoBytes } -> { path, signedUrl, contentType }
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   body inválido ......................... 400
//   extensión fuera de la lista ........... 400 (mensaje para el admin)
//   tamaño > 50 MB ........................ 400 (mensaje para el admin)
//   ok .................................... 200 con una URL de subida firmada para
//                                           `pendientes/<uuid>.<ext>`
//
// DELETE { path }                       -> 204 (idempotente)
//   Descarta un archivo pendiente (el admin canceló o falló el alta). Solo acepta paths
//   `pendientes/<uuid>.<ext>`: nunca puede borrar un archivo ya guardado.
//
// Ruta estática (`materiales/subida`): gana sobre `[entidad]/[id]`.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { after } from "next/server";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { barrerPendientes, borrarObjeto, crearSubidaFirmada } from "@/lib/materiales/storage";
import {
  extensionDe,
  formatearTamano,
  MAX_BYTES,
  PATH_PENDIENTE_REGEX,
} from "@/lib/materiales/tipos";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const postSchema = z.object({
  nombreArchivo: z.string().min(1).max(255),
  tamanoBytes: z.number().int().positive(),
});

const deleteSchema = z.object({ path: z.string().regex(PATH_PENDIENTE_REGEX) });

export async function POST(req: Request): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = postSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const extension = extensionDe(body.data.nombreArchivo);
  if (!extension) {
    return Response.json(
      { error: "Ese tipo de archivo no está permitido. Subí un PDF, PowerPoint, Excel o Word." },
      { status: 400 },
    );
  }
  if (body.data.tamanoBytes > MAX_BYTES) {
    return Response.json(
      { error: `El archivo supera el máximo de ${formatearTamano(MAX_BYTES)}.` },
      { status: 400 },
    );
  }

  try {
    const subida = await crearSubidaFirmada(extension);
    // Limpia los pendientes viejos DESPUÉS de responder: no demora al admin y, como nunca
    // tira, tampoco puede impedirle subir.
    after(() => barrerPendientes());
    return Response.json(subida);
  } catch (e) {
    Sentry.captureException(e, { extra: { detalle: "crearSubidaFirmada", extension } });
    return Response.json({ error: "No se pudo preparar la subida." }, { status: 500 });
  }
}

export async function DELETE(req: Request): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = deleteSchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  try {
    await borrarObjeto(body.data.path);
    return new Response(null, { status: 204 });
  } catch (e) {
    Sentry.captureException(e, { extra: { detalle: "descartar pendiente", path: body.data.path } });
    return Response.json({ error: "No se pudo descartar el archivo." }, { status: 500 });
  }
}
