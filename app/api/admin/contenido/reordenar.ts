// Handler compartido de "reordenar arrastrando" para las entidades que lo permiten: videos
// (`PUT /api/admin/contenido/videos/orden`) y, desde VGRP-88, materiales
// (`PUT /api/admin/contenido/materiales/orden`). Cada route.ts es una línea que lo llama con su
// entidad; el contrato HTTP es el mismo:
//
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   body inválido / ids repetidos ......... 400 (no toca la base)
//   algún id no existe .................... 404 (no reordena nada)
//   ok .................................... 200 { orden } + audit log + revalidateTag
//
// No es un route.ts, así que Next no lo expone como ruta.

import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { ItemNoEncontrado, reordenarContenido, TAG_POR_ENTIDAD } from "@/lib/data/admin/contenido";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

const bodySchema = z.object({
  ids: z
    .array(z.uuid())
    .min(1)
    .max(500)
    .refine((ids) => new Set(ids).size === ids.length, "ids repetidos"),
});

export async function reordenar(req: Request, entidad: "videos" | "materiales"): Promise<Response> {
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
      { actorId: guard.actorId, accion: "reordenar_contenido", entidad },
      () => reordenarContenido(admin, entidad, body.data.ids),
    );
    revalidateTag(TAG_POR_ENTIDAD[entidad]);
    return Response.json({ orden });
  } catch (e) {
    if (e instanceof ItemNoEncontrado) {
      return Response.json({ error: "No encontrado." }, { status: 404 });
    }
    Sentry.captureException(e, { extra: { detalle: "reordenarContenido", entidad } });
    return Response.json({ error: "No se pudo guardar el orden." }, { status: 500 });
  }
}
