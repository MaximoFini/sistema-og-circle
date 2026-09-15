// =============================================================================
// VGRP-40 / Pendientes — GET|PATCH /api/admin/config
//
// Lectura y escritura de `precios` y `flags` de Edge Config. Contrato HTTP
// (design.md specs/bloque-10-pendientes/design-vgrp40.md §Interfaces):
//
//   GET  sin sesión ......................... 401
//   GET  rol != admin ....................... 404
//   GET  ok .................................. 200 { precios, flags }
//
//   PATCH sin sesión ........................ 401
//   PATCH rol != admin ...................... 404 (sin tocar Edge Config)
//   PATCH body inválido ..................... 400 (sin tocar Edge Config)
//   PATCH escribirEdgeConfig() falla ........ 502 (sin audit log)
//   PATCH ok ................................. 200 { valorAnterior, valorNuevo } + audit
//
// `requireAdmin()` va PRIMERO, antes de leer `getConfig()` o llamar a
// `escribirEdgeConfig()`. Body de PATCH acepta EXACTAMENTE una de las dos
// claves completas (`precios` o `flags`) — nunca un parche parcial, porque
// Edge Config reemplaza el objeto entero de la clave, no hace merge profundo.
// =============================================================================

import * as Sentry from "@sentry/nextjs";
import { z } from "zod";
import { requireAdmin } from "@/lib/auth/admin";
import { getConfig } from "@/lib/config";
import { configSchema } from "@/lib/config/schema";
import { escribirEdgeConfig } from "@/lib/config/write";
import { conAuditoria } from "@/lib/data/admin/audit-log";
import { createServiceRoleClient } from "@/lib/supabase/service-role";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const patchBodySchema = z.union([
  z.object({ precios: configSchema.shape.precios }).strict(),
  z.object({ flags: configSchema.shape.flags }).strict(),
]);

export async function GET(): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const { precios, flags } = await getConfig();
  return Response.json({ precios, flags });
}

export async function PATCH(req: Request): Promise<Response> {
  const guard = await requireAdmin();
  if (!guard.ok) return guard.response;

  const parsed = patchBodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) {
    return Response.json(
      { error: "Datos inválidos.", fieldErrors: z.flattenError(parsed.error).fieldErrors },
      { status: 400 },
    );
  }

  const { clave, valorNuevo } =
    "precios" in parsed.data
      ? { clave: "precios" as const, valorNuevo: parsed.data.precios }
      : { clave: "flags" as const, valorNuevo: parsed.data.flags };

  const actual = await getConfig();
  // Si la lectura previa de precios falló, no hay forma de saber el valor
  // anterior real — se audita `null` en vez de bloquear el cambio: no dejar
  // guardar un precio nuevo justamente PORQUE Edge Config no respondía bien
  // sería el caso exacto que este ticket viene a poder reparar a mano.
  const valorAnterior =
    clave === "precios" ? (actual.precios.ok ? actual.precios.precios : null) : actual.flags;

  const escritura = await escribirEdgeConfig([{ key: clave, value: valorNuevo }]);
  if (!escritura.ok) {
    Sentry.captureException(new Error("escribirEdgeConfig falló"), {
      extra: {
        detalle: "admin/config",
        clave,
        status: escritura.status,
        message: escritura.message,
      },
    });
    return Response.json(
      { error: "No se pudo guardar en Edge Config. Reintentá." },
      { status: 502 },
    );
  }

  const admin = createServiceRoleClient();
  await conAuditoria(
    admin,
    { actorId: guard.actorId, accion: "actualizar_config", entidad: "config", entidadId: clave },
    async () => ({ resultado: { valorAnterior, valorNuevo }, valorAnterior, valorNuevo }),
  );

  return Response.json({ valorAnterior, valorNuevo });
}
