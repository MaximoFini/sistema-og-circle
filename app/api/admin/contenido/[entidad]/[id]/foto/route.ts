// =============================================================================
// PUT|DELETE /api/admin/contenido/[entidad]/[id]/foto
// Foto de perfil de agentes y profesionales.
// Spec: specs/foto-perfil-agentes-profesionales/design.md (§Interfaces)
//
// Contrato HTTP (mismo guard que [id]/route.ts):
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   :entidad sin foto (videos, etc.) ...... 400 (sin tocar la base)
//   :id no-uuid ............................ 404
//   PUT sin archivo / imagen inválida ..... 400 { error } (no cambia nada)
//   :id uuid pero sin fila ................ 404 (SIN audit log)
//   PUT ok ................................ 200 { fotoUrl } + audit + revalidateTag
//   DELETE ok ............................. 200 {} + audit + revalidateTag
//   DELETE sin foto previa ................ 200 {} (idempotente, sin audit)
//
// `foto_path` sólo se escribe por acá: los schemas Zod del CRUD genérico no
// lo incluyen, así que un PATCH a [id] no puede tocarlo.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { ItemNoEncontrado, TAG_POR_ENTIDAD } from "@/lib/data/admin/contenido";
import { FOTO_SUBIDA_MAX_BYTES, tieneFoto } from "@/lib/fotos/constantes";
import { cambiarFoto, leerFoto, quitarFoto } from "@/lib/fotos/mutaciones";
import { FotoInvalida, procesarFoto } from "@/lib/fotos/procesar";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Holgura sobre el tope de la foto para los bordes y campos del multipart. */
const MARGEN_MULTIPART_BYTES = 64 * 1024;

type Params = { params: Promise<{ entidad: string; id: string }> };

function validarRuta(entidad: string, id: string) {
  if (!tieneFoto(entidad)) {
    return {
      ok: false as const,
      response: Response.json({ error: "No encontrado." }, { status: 400 }),
    };
  }
  if (!z.uuid().safeParse(id).success) {
    return {
      ok: false as const,
      response: Response.json({ error: "No encontrado." }, { status: 404 }),
    };
  }
  return { ok: true as const, entidad };
}

/** Lee el campo `foto` del multipart. `null` + mensaje si falta o es enorme. */
async function leerArchivo(req: Request): Promise<{ buffer: Buffer } | { error: string }> {
  // Corte temprano por Content-Length: no leer al servidor un body enorme.
  // El multipart agrega unos cientos de bytes al archivo, de ahí el margen.
  const largo = Number(req.headers.get("content-length") ?? "0");
  if (largo > FOTO_SUBIDA_MAX_BYTES + MARGEN_MULTIPART_BYTES) {
    return { error: "La foto es demasiado pesada. Probá con otra imagen." };
  }

  const form = await req.formData().catch(() => null);
  const archivo = form?.get("foto");
  if (!(archivo instanceof Blob) || archivo.size === 0) {
    return { error: "Falta la foto." };
  }
  if (archivo.size > FOTO_SUBIDA_MAX_BYTES) {
    return { error: "La foto es demasiado pesada. Probá con otra imagen." };
  }
  return { buffer: Buffer.from(await archivo.arrayBuffer()) };
}

export async function PUT(req: Request, { params }: Params): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { entidad: entidadCruda, id } = await params;
  const validado = validarRuta(entidadCruda, id);
  if (!validado.ok) return validado.response;
  const entidad = validado.entidad;

  const archivo = await leerArchivo(req);
  if ("error" in archivo) return Response.json({ error: archivo.error }, { status: 400 });

  let webp: Buffer;
  try {
    webp = await procesarFoto(archivo.buffer);
  } catch (e) {
    if (e instanceof FotoInvalida) return Response.json({ error: e.message }, { status: 400 });
    throw e;
  }

  const admin = createServiceRoleClient();
  try {
    const out = await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "cambiar_foto_contenido", entidad, entidadId: id },
      () => cambiarFoto(admin, entidad, id, webp),
    );
    revalidateTag(TAG_POR_ENTIDAD[entidad]);
    return Response.json(out);
  } catch (e) {
    if (e instanceof ItemNoEncontrado) {
      return Response.json({ error: "No encontrado." }, { status: 404 });
    }
    Sentry.captureException(e, { extra: { detalle: "cambiarFoto", entidad, id } });
    return Response.json({ error: "No se pudo guardar la foto." }, { status: 500 });
  }
}

export async function DELETE(_req: Request, { params }: Params): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { entidad: entidadCruda, id } = await params;
  const validado = validarRuta(entidadCruda, id);
  if (!validado.ok) return validado.response;
  const entidad = validado.entidad;

  const admin = createServiceRoleClient();
  try {
    const anterior = await leerFoto(admin, entidad, id);
    const fotoPath = anterior.foto_path;
    if (!fotoPath) return Response.json({});

    await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "quitar_foto_contenido", entidad, entidadId: id },
      () => quitarFoto(admin, entidad, id, { ...anterior, foto_path: fotoPath }),
    );
    revalidateTag(TAG_POR_ENTIDAD[entidad]);
    return Response.json({});
  } catch (e) {
    if (e instanceof ItemNoEncontrado) {
      return Response.json({ error: "No encontrado." }, { status: 404 });
    }
    Sentry.captureException(e, { extra: { detalle: "quitarFoto", entidad, id } });
    return Response.json({ error: "No se pudo quitar la foto." }, { status: 500 });
  }
}
