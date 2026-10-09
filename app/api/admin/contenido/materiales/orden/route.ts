// =============================================================================
// PUT /api/admin/contenido/materiales/orden — reordenar materiales arrastrando (VGRP-88).
//
// Mismo contrato que videos/orden (401 / 404 / 400 / 200): vive en ../../reordenar.ts.
//
// Ruta estática (`materiales/orden`): gana sobre `[entidad]/[id]`, así "orden" nunca se
// interpreta como el id de un material.
// =============================================================================

import { reordenar } from "../../reordenar";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export function PUT(req: Request): Promise<Response> {
  return reordenar(req, "materiales");
}
