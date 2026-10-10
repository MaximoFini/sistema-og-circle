// =============================================================================
// PUT /api/admin/contenido/videos/orden — reordenar videos arrastrando.
//
// El contrato HTTP (401 / 404 / 400 / 200) y la lógica viven en ../../reordenar.ts, que
// comparte con materiales (VGRP-88).
//
// Ruta estática (`videos/orden`): gana sobre `[entidad]/[id]`, así "orden" nunca
// se interpreta como el id de un video.
// =============================================================================

import { requireAdmin } from "@/lib/auth/admin";
import { reordenar } from "../../reordenar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function PUT(req: Request): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  return reordenar(req, "videos", guard.actorId);
}
