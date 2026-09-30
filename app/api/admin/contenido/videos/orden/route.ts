// =============================================================================
// PUT /api/admin/contenido/videos/orden — reordenar videos arrastrando.
//
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   body inválido / ids repetidos ......... 400 (no toca la base)
//   algún id no existe .................... 404 (no reordena nada)
//   ok .................................... 200 { orden } + audit log + revalidateTag
//
// Ruta estática (`videos/orden`): gana sobre `[entidad]/[id]`, así "orden" nunca
// se interpreta como el id de un video.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { ItemNoEncontrado, reordenarVideos, TAG_POR_ENTIDAD } from "@/lib/data/admin/contenido";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "ids repetidos"),
});

export async function PUT(req: Request): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = bodySchema.safeParse(await req.json().catch(() => null));
  if (!body.success) {
    return Response.json({ error: "Datos inválidos." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  try {
    const orden = await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "reordenar_contenido", entidad: "videos" },
      () => reordenarVideos(admin, body.data.ids),
    );
    revalidateTag(TAG_POR_ENTIDAD.videos);
    return Response.json({ orden });
  } catch (e) {
    if (e instanceof ItemNoEncontrado) {
      return Response.json({ error: "No encontrado." }, { status: 404 });
    }
    Sentry.captureException(e, { extra: { detalle: "reordenarVideos" } });
    return Response.json({ error: "No se pudo guardar el orden." }, { status: 500 });
  }
}
