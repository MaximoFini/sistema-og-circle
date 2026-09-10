// =============================================================================
// VGRP-38 / Bloque 7 — GET|POST /api/admin/contenido/[entidad]
//
// Contrato HTTP (design-vgrp38.md):
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   :entidad fuera de la lista blanca ..... 400 (sin tocar la base)
//   POST con body inválido ................ 400 (no crea nada)
//   GET  ok ............................... 200 { items }
//   POST ok ............................... 200 { fila creada } + audit log
//                                            + revalidateTag
//
// `requireAdmin()` va PRIMERO, antes de instanciar `createServiceRoleClient()`
// o llamar a `lib/data/admin/contenido.ts`.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { revalidateTag } from "next/cache";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import {
  crearContenido,
  esEntidadValida,
  listarContenido,
  TAG_POR_ENTIDAD,
} from "@/lib/data/admin/contenido";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ entidad: string }> },
): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { entidad } = await params;
  if (!esEntidadValida(entidad)) {
    return Response.json({ error: "No encontrado." }, { status: 400 });
  }

  const admin = createServiceRoleClient();
  try {
    const items = await listarContenido(admin, entidad);
    return Response.json({ items });
  } catch (e) {
    Sentry.captureException(e, { extra: { detalle: "listarContenido", entidad } });
    return Response.json({ error: "No se pudo listar el contenido." }, { status: 500 });
  }
}

export async function POST(
  req: Request,
  { params }: { params: Promise<{ entidad: string }> },
): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { entidad } = await params;
  if (!esEntidadValida(entidad)) {
    return Response.json({ error: "No encontrado." }, { status: 400 });
  }

  const body = await req.json().catch(() => null);
  const admin = createServiceRoleClient();

  try {
    const out = await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "crear_contenido", entidad },
      () => crearContenido(admin, entidad, body),
    );
    revalidateTag(TAG_POR_ENTIDAD[entidad]);
    return Response.json(out);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Response.json(
        { error: "Datos inválidos.", fieldErrors: z.flattenError(e).fieldErrors },
        { status: 400 },
      );
    }
    Sentry.captureException(e, { extra: { detalle: "crearContenido", entidad } });
    return Response.json({ error: "No se pudo crear el ítem." }, { status: 500 });
  }
}
