// =============================================================================
// VGRP-62 / Bloque 13 — POST /api/admin/cuentas/[id]/activar
//
// Deja `:id` como la ÚNICA cuenta activa (la que ven los usuarios al pagar).
// Es la acción más sensible del módulo: una cuenta mal elegida desvía plata, así
// que queda en admin_audit_log con la cuenta anterior y la nueva.
//
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica)
//   :id no-uuid ............................ 404
//   :id uuid pero sin fila ................ 404 (SIN audit log)
//   ok ..................................... 200 { cuenta activada } + audit log
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { activarCuenta, CuentaNoEncontrada } from "@/lib/data/admin/cuentas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type Params = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: Params): Promise<Response> {
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
      {
        actorId: guard.actorId,
        accion: "activar_cuenta_cobro",
        entidad: "cuentas_cobro",
        entidadId: id,
      },
      () => activarCuenta(admin, id),
    );
    return Response.json(out);
  } catch (e) {
    if (e instanceof CuentaNoEncontrada) {
      return Response.json({ error: "No encontrado." }, { status: 404 });
    }
    Sentry.captureException(e, { extra: { detalle: "activarCuenta", id } });
    return Response.json({ error: "No se pudo activar la cuenta." }, { status: 500 });
  }
}
