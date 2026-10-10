// =============================================================================
// PUT /api/admin/contenido/materiales/orden — reordenar materiales arrastrando (VGRP-88).
//
// Mismo contrato que videos/orden (401 / 404 / 400 / 200): vive en ../../reordenar.ts.
//
// Ruta estática (`materiales/orden`): gana sobre `[entidad]/[id]`, así "orden" nunca se
// interpreta como el id de un material.
// =============================================================================

import { requireAdmin } from "@/lib/auth/admin";
import { reordenar } from "../../reordenar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  return reordenar(req, "materiales", guard.actorId);
}
