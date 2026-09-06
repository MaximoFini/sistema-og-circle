// =============================================================================
// VGRP-35 / Bloque 5 — Guards de rol para el área de admin.
//
// Segunda y tercera capa de la verificación de rol (la primera es
// `middleware.ts`). Las tres leen `app_metadata.rol` del JWT YA VERIFICADO
// localmente (`getVerifiedClaims()` -> `supabase.auth.getClaims()`, ES256 en
// memoria) — CERO queries, nunca `getUser()`, nunca un `select` a `profiles`.
// Ver la regla dura de `lib/auth/server.ts` y design.md §"Dónde vive la
// verificación de rol".
//
// Criterio no negociable (requirements.md US-1): un usuario con sesión pero
// `rol != 'admin'` recibe SIEMPRE `404` — nunca `403` (confirmaría que la
// ruta existe), nunca una pantalla parcial de admin.
// =============================================================================

import "server-only";

import { notFound, redirect } from "next/navigation";
import { getRol } from "./claims";
import { getVerifiedClaims } from "./server";

export type AdminGuard = { ok: true; actorId: string } | { ok: false; response: Response };

/**
 * Guard para Route Handlers de `app/api/admin/*`. No hace query: lee el claim
 * ya verificado localmente. Devuelve el `actorId` (claim `sub`) o una
 * `Response` lista para retornar.
 *
 * - Sin sesión -> `{ ok: false }` con `401`.
 * - `rol != 'admin'` (o `sub` vacío) -> `{ ok: false }` con `404` — mismo
 *   criterio que el middleware, nunca `403`.
 *
 * El handler DEBE cortar con `if (!guard.ok) return guard.response;` antes de
 * instanciar `createServiceRoleClient()` o llamar a `lib/data/admin/*`.
 */
export async function requireAdmin(): Promise<AdminGuard> {
  const claims = await getVerifiedClaims();
  if (!claims) {
    return {
      ok: false,
      response: Response.json({ error: "No autenticado." }, { status: 401 }),
    };
  }

  const actorId = typeof claims.sub === "string" ? claims.sub : "";
  if (getRol(claims) !== "admin" || !actorId) {
    return {
      ok: false,
      response: Response.json({ error: "No encontrado." }, { status: 404 }),
    };
  }

  return { ok: true, actorId };
}

/**
 * Variante para Server Components / el layout de `app/admin/`: en vez de
 * devolver una `Response`, interrumpe el render con `redirect()` / `notFound()`
 * (las dos lanzan, así que ningún hijo del layout llega a renderizar —
 * "nunca pantalla parcial").
 *
 * - Sin sesión -> `redirect('/login?next=/admin')`.
 * - `rol != 'admin'` (o `sub` vacío) -> `notFound()` (404 tematizado por
 *   `app/admin/not-found.tsx`).
 */
export async function requireAdminPage(): Promise<{ actorId: string }> {
  const claims = await getVerifiedClaims();
  if (!claims) redirect("/login?next=/admin");

  const actorId = typeof claims.sub === "string" ? claims.sub : "";
  if (getRol(claims) !== "admin" || !actorId) notFound();

  return { actorId };
}
