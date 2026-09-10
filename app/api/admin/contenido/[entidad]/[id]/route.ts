// =============================================================================
// VGRP-38 / Bloque 7 — PATCH|DELETE /api/admin/contenido/[entidad]/[id]
//
// Contrato HTTP (design-vgrp38.md):
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   :entidad fuera de la lista blanca ..... 400 (sin tocar la base)
//   :id no-uuid ............................ 404
//   PATCH body inválido ................... 400 (no cambia nada)
//   :id uuid pero sin fila ................ 404 (SIN audit log)
//   ok ..................................... 200 + audit log + revalidateTag
//
// DELETE de `videos`: SIEMPRE soft-delete (`publicado=false`) — ver
// `borrarContenido()` en lib/data/admin/contenido.ts. El resto: DELETE real.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import {
  actualizarContenido,
  borrarContenido,
  esEntidadValida,
  ItemNoEncontrado,
  TAG_POR_ENTIDAD,
} from "@/lib/data/admin/contenido";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ entidad: string; id: string }> };

function validarRuta(entidad: string, id: string) {
  if (!esEntidadValida(entidad)) {
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

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { entidad: entidadCruda, id } = await params;
  const validado = validarRuta(entidadCruda, id);
  if (!validado.ok) return validado.response;
  const entidad = validado.entidad;

  const body = await req.json().catch(() => null);
  const admin = createServiceRoleClient();

  try {
    const out = await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "editar_contenido", entidad, entidadId: id },
      () => actualizarContenido(admin, entidad, id, body),
    );
    revalidateTag(TAG_POR_ENTIDAD[entidad]);
    return Response.json(out);
  } catch (e) {
    if (e instanceof ItemNoEncontrado) {
      return Response.json({ error: "No encontrado." }, { status: 404 });
    }
    if (e instanceof z.ZodError) {
      return Response.json(
        { error: "Datos inválidos.", fieldErrors: z.flattenError(e).fieldErrors },
        { status: 400 },
      );
    }
    Sentry.captureException(e, { extra: { detalle: "actualizarContenido", entidad, id } });
    return Response.json({ error: "No se pudo actualizar el ítem." }, { status: 500 });
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
    const out = await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "borrar_contenido", entidad, entidadId: id },
      () => borrarContenido(admin, entidad, id),
    );
    revalidateTag(TAG_POR_ENTIDAD[entidad]);
    return Response.json(out ?? {});
  } catch (e) {
    if (e instanceof ItemNoEncontrado) {
      return Response.json({ error: "No encontrado." }, { status: 404 });
    }
    Sentry.captureException(e, { extra: { detalle: "borrarContenido", entidad, id } });
    return Response.json({ error: "No se pudo borrar el ítem." }, { status: 500 });
  }
}
