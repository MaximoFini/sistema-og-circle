// =============================================================================
// PUT /api/admin/contenido/videos/orden — reordenar videos arrastrando.
//
// El contrato HTTP (401 / 404 / 400 / 200) y la lógica viven en ../../reordenar.ts, que
// comparte con materiales (VGRP-88).
//
// Ruta estática (`videos/orden`): gana sobre `[entidad]/[id]`, así "orden" nunca
// se interpreta como el id de un video.
// =============================================================================

import { reordenar } from "../../reordenar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PUT(req: Request): Promise<Response> {
  return reordenar(req, "videos");
}
