// =============================================================================
// VGRP-62 / Bloque 13 — GET|POST /api/admin/cuentas
//
// Contrato HTTP (mismo que /api/admin/contenido):
//   sin sesión ............................ 401
//   rol != admin .......................... 404 (sin ejecutar lógica; nunca 403,
//                                              ver lib/auth/admin.ts)
//   POST con body inválido ................ 400 con fieldErrors (no crea nada)
//   GET  ok ............................... 200 { items }
//   POST ok ............................... 200 { fila creada } + audit log
//
// Una cuenta nueva siempre nace INACTIVA; se activa con
// POST /api/admin/cuentas/[id]/activar.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { crearCuenta, listarCuentas } from "@/lib/data/admin/cuentas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const admin = createServiceRoleClient();
  try {
    const items = await listarCuentas(admin);
    return Response.json({ items });
  } catch (e) {
    Sentry.captureException(e, { extra: { detalle: "listarCuentas" } });
    return Response.json({ error: "No se pudieron listar las cuentas." }, { status: 500 });
  }
}

export async function POST(req: Request): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const body = await req.json().catch(() => null);
  const admin = createServiceRoleClient();

  try {
    const out = await conAuditoria(
      admin,
      { actorId: guard.actorId, accion: "crear_cuenta_cobro", entidad: "cuentas_cobro" },
      () => crearCuenta(admin, body),
    );
    return Response.json(out);
  } catch (e) {
    if (e instanceof z.ZodError) {
      return Response.json(
        { error: "Datos inválidos.", fieldErrors: z.flattenError(e).fieldErrors },
        { status: 400 },
      );
    }
    Sentry.captureException(e, { extra: { detalle: "crearCuenta" } });
    return Response.json({ error: "No se pudo crear la cuenta." }, { status: 500 });
  }
}
