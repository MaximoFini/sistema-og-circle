// VGRP-16 — helpers puros para leer los claims inyectados por el Custom
// Access Token Hook (supabase/migrations/20260822035925_auth_hook.sql).
//
// Sin I/O a propósito: no tocan `@supabase/supabase-js` ni hacen networking,
// para poder testearlos sin mockear nada. La verificación/decodificación del
// JWT en sí vive en lib/auth/server.ts.

import type { NivelAcceso, RolUsuario } from "../database.types";

// Reexportados acá para que quien importe sólo `lib/auth/claims` no necesite
// también importar de `lib/database.types` — pero siguen siendo LA MISMA
// fuente de verdad (no se redeclaran los strings de los enums en ningún
// lado de este archivo).
export type { NivelAcceso, RolUsuario };

const NIVEL_DEFAULT: NivelAcceso = "ninguno";
const ROL_DEFAULT: RolUsuario = "user";

// Orden de acceso creciente. Vive acá (no en database.types.ts) porque es
// una interpretación de negocio del enum, no parte de la forma de la base.
//
// VGRP-59/60 (Bloque 13 — plan único): el enum pasó de tres valores
// (ninguno/principiante/avanzado) a dos (ninguno/completo). `completo` es el
// identificador interno del único plan — el nombre comercial ("Plan X" por
// ahora) vive en Edge Config (lib/config/schema.ts) y no acá.
const NIVEL_ORDEN: Record<NivelAcceso, number> = {
  ninguno: 0,
  completo: 1,
};

// TRANSICIÓN DE TOKENS (VGRP-60) — los JWT emitidos ANTES del deploy de
// VGRP-59 todavía traen 'principiante'/'avanzado' (hasta que venzan, ~1h de
// vida del access token). `getNivel()` los mapea acá a 'completo' para no
// dejar sin acceso a nadie que ya había pagado. `isNivelAcceso()` sigue
// validando sólo contra el enum REAL (ninguno/completo): este mapeo vive
// antes de esa validación, no la reemplaza.
//
// TODO(borrar después de 2026-10-09): pasada una semana desde el deploy de
// VGRP-59/60, todo token viejo ya venció y se puede borrar este mapeo junto
// con este comentario.
const NIVELES_VIEJOS_A_COMPLETO = new Set(["principiante", "avanzado"]);

/**
 * Exportado para que otros puntos que leen un nivel "crudo" de un lugar que
 * no es `app_metadata` del JWT (hoy: `metadata.nivel` de una preferencia de
 * Mercado Pago creada antes del deploy de VGRP-59, en el webhook) apliquen el
 * mismo mapeo de transición que `getNivel()`, sin duplicar el Set ni el
 * criterio. Devuelve `null` si `valor` no es ni un nivel válido ni uno de los
 * viejos — el caller decide qué hacer con "no es un nivel reconocible".
 */
export function normalizarNivelLegacy(valor: unknown): NivelAcceso | null {
  if (typeof valor === "string" && NIVELES_VIEJOS_A_COMPLETO.has(valor)) return "completo";
  return isNivelAcceso(valor) ? valor : null;
}

/**
 * Forma mínima de app_metadata que nos interesa de los claims del JWT. Los
 * claims reales (JwtPayload de @supabase/supabase-js) traen muchos más
 * campos (aud, exp, sub, role, etc.); acá sólo se tipa lo que este módulo
 * necesita leer, para no acoplar lib/auth/claims.ts al tipo completo del SDK.
 */
export interface AppMetadataClaims {
  app_metadata?: {
    nivel?: unknown;
    rol?: unknown;
    [key: string]: unknown;
  } | null;
  [key: string]: unknown;
}

function isNivelAcceso(value: unknown): value is NivelAcceso {
  return value === "ninguno" || value === "completo";
}

function isRolUsuario(value: unknown): value is RolUsuario {
  return value === "user" || value === "admin";
}

/**
 * Lee `app_metadata.nivel` de los claims. Si falta, no es un string válido
 * del enum, o el claim es de un token viejo emitido antes de que el hook
 * (VGRP-16) estuviera registrado, devuelve el mismo default que la columna
 * `profiles.nivel` en la base ('ninguno') — nunca lanza.
 *
 * VGRP-60 — mapea los valores viejos del enum de dos niveles
 * ('principiante'/'avanzado', de un token emitido antes del deploy de
 * VGRP-59) a 'completo': ver el comentario de `NIVELES_VIEJOS_A_COMPLETO`.
 */
export function getNivel(claims: AppMetadataClaims | null | undefined): NivelAcceso {
  const raw = claims?.app_metadata?.nivel;
  if (typeof raw === "string" && NIVELES_VIEJOS_A_COMPLETO.has(raw)) return "completo";
  return isNivelAcceso(raw) ? raw : NIVEL_DEFAULT;
}

/**
 * Lee `app_metadata.rol` de los claims. Mismo criterio de fallback que
 * getNivel(): default seguro ('user'), nunca lanza.
 */
export function getRol(claims: AppMetadataClaims | null | undefined): RolUsuario {
  const raw = claims?.app_metadata?.rol;
  return isRolUsuario(raw) ? raw : ROL_DEFAULT;
}

/**
 * Compara el nivel de los claims contra un mínimo requerido, usando el orden
 * 'ninguno' < 'completo'. Se mantiene por compatibilidad con el código y los
 * tests existentes — para gating nuevo, preferir `tieneAcceso()` (más
 * expresivo ahora que sólo hay un plan: no hay "mínimo" que elegir).
 */
export function hasNivel(
  claims: AppMetadataClaims | null | undefined,
  minimo: NivelAcceso,
): boolean {
  return NIVEL_ORDEN[getNivel(claims)] >= NIVEL_ORDEN[minimo];
}

/**
 * VGRP-60 — helper de gating para el modelo de un solo plan: `true` si el
 * usuario tiene el plan completo, `false` si no (incluye sesión ausente,
 * `claims` null). Reemplaza a `hasNivel(claims, 'completo')` en el código
 * nuevo — mismo resultado, pero sin pedirle al caller que piense en un
 * "nivel mínimo" que ya no existe.
 */
export function tieneAcceso(claims: AppMetadataClaims | null | undefined): boolean {
  return getNivel(claims) === "completo";
}
