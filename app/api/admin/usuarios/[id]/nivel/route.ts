// =============================================================================
// VGRP-36 / Bloque 5 — POST /api/admin/usuarios/[id]/nivel
//
// Activación / cambio manual de nivel de un usuario. Contrato HTTP explícito
// (design.md §"POST /api/admin/usuarios/[id]/nivel"):
//
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   id no-uuid ............................ 404
//   body sin motivo / motivo en blanco .... 400 (no cambia nada)
//   nivel fuera del enum ................... 400
//   id uuid pero sin usuario .............. 404 (SIN audit log)
//   ok ................................... 200 { nivelAnterior, nivelNuevo } + fila de audit
//
// `requireAdmin()` va PRIMERO, antes de instanciar `createServiceRoleClient()`
// o llamar a `lib/data/admin/*`. Toda la mutación pasa por `conAuditoria()`.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { activarNivel, UsuarioNoEncontrado } from "@/lib/data/admin/usuarios";
import { Constants } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const bodySchema = z.object({
  nivel: z.enum(Constants.public.Enums.nivel_acceso),
  motivo: z.string().trim().min(1, "El motivo es obligatorio."),
});

export async function POST(
  req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "No encontrado." }, { status: 404 });
  }

  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const admin = createServiceRoleClient();
  try {
    const out = await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "cambiar_nivel", entidad: "profiles", entidadId: id },
      () => activarNivel(admin, { userId: id, actorId: guard.actorId, ...parsed.data }),
    );
    return Response.json(out);
  } catch (e) {
    if (e instanceof UsuarioNoEncontrado) {
      return Response.json({ error: "Usuario no encontrado." }, { status: 404 });
    }
    Sentry.captureException(e, { extra: { detalle: "activarNivel" } });
    return Response.json({ error: "No se pudo aplicar el cambio." }, { status: 500 });
  }
}
