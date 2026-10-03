// =============================================================================
// VGRP-62 / Bloque 13 — PATCH /api/admin/cuentas/[id]
//
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   :id no-uuid ............................ 404
//   body inválido (o vacío) ............... 400 con fieldErrors (no cambia nada)
//   :id uuid pero sin fila ................ 404 (SIN audit log)
//   ok ..................................... 200 + audit log (valor anterior/nuevo)
//
// Editar NO cambia cuál es la cuenta activa: `activa` no se acepta acá.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { actualizarCuenta, CuentaNoEncontrada } from "@/lib/data/admin/cuentas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function PATCH(req: Request, { params }: Params): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "No encontrado." }, { status: 404 });
  }

  const body = await req.json().catch(() => null);
  const admin = createServiceRoleClient();

  try {
    const out = await conAuditoria(
      admin,
      {
        actorId: guard.actorId,
        accion: "editar_cuenta_cobro",
        entidad: "cuentas_cobro",
        entidadId: id,
      },
      () => actualizarCuenta(admin, id, body),
    );
    return Response.json(out);
  } catch (e) {
    if (e instanceof CuentaNoEncontrada) {
      return Response.json({ error: "No encontrado." }, { status: 404 });
    }
    if (e instanceof z.ZodError) {
      return Response.json(
        { error: "Datos inválidos.", fieldErrors: z.flattenError(e).fieldErrors },
        { status: 400 },
      );
    }
    Sentry.captureException(e, { extra: { detalle: "actualizarCuenta", id } });
    return Response.json({ error: "No se pudo actualizar la cuenta." }, { status: 500 });
  }
}
