// =============================================================================
// VGRP-37 / Bloque 5 — POST /api/admin/pagos/[id]/reprocesar
//
// Reproceso de un pago aprobado que no se aplicó. Contrato HTTP explícito
// (design.md §"POST /api/admin/pagos/[id]/reprocesar"):
//
//   sin sesión ........................... 401
//   rol != admin ......................... 404 (sin ejecutar lógica)
//   id no-uuid ........................... 404
//   pago inexistente .................... 404 (SIN audit log)
//   pago existe, estado != 'approved' ... 409 (SIN audit, SIN cambios)
//   ok ................................. 200 { nivelAnterior, nivelNuevo } + fila de audit
//
// `requireAdmin()` va PRIMERO, antes de instanciar `createServiceRoleClient()` o
// llamar a `lib/data/admin/*`. Toda la mutación pasa por `conAuditoria()`.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { PagoNoEncontrado, PagoNoReprocesable, reprocesarPago } from "@/lib/data/admin/pagos";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { id } = await params;
  if (!z.uuid().safeParse(id).success) {
    return Response.json({ error: "No encontrado." }, { status: 404 });
  }

  const admin = createServiceRoleClient();
  try {
    const out = await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "reprocesar_pago", entidad: "pagos", entidadId: id },
      () => reprocesarPago(admin, { pagoId: id, actorId: guard.actorId }),
    );
    return Response.json(out);
  } catch (e) {
    if (e instanceof PagoNoEncontrado) {
      return Response.json({ error: "Pago no encontrado." }, { status: 404 });
    }
    if (e instanceof PagoNoReprocesable) {
      return Response.json(
        { error: "Sólo se puede reprocesar un pago aprobado." },
        { status: 409 },
      );
    }
    Sentry.captureException(e, { extra: { detalle: "reprocesarPago" } });
    return Response.json({ error: "No se pudo reprocesar el pago." }, { status: 500 });
  }
}
