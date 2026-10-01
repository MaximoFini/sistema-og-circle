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
const NIVEL_ORDEN: Record<NivelAcceso, number> = {
  ninguno: 0,
  principiante: 1,
  avanzado: 2,
};

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
  return value === "ninguno" || value === "principiante" || value === "avanzado";
}

function isRolUsuario(value: unknown): value is RolUsuario {
  return value === "user" || value === "admin";
}

/**
 * Lee `app_metadata.nivel` de los claims. Si falta, no es un string válido
 * del enum, o el claim es de un token viejo emitido antes de que el hook
 * (VGRP-16) estuviera registrado, devuelve el mismo default que la columna
 * `profiles.nivel` en la base ('ninguno') — nunca lanza.
 */
export function getNivel(claims: AppMetadataClaims | null | undefined): NivelAcceso {
  const raw = claims?.app_metadata?.nivel;
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
 * Compara el nivel de los claims contra un mínimo requerido, usando el
 * orden 'ninguno' < 'principiante' < 'avanzado'. Pensado para gating futuro
 * (middleware VGRP-17, guards de página): `hasNivel(claims, 'principiante')`
 * es true tanto para 'principiante' como para 'avanzado'.
 */
export function hasNivel(
  claims: AppMetadataClaims | null | undefined,
  minimo: NivelAcceso,
): boolean {
  return nivelAlcanzaOSupera(getNivel(claims), minimo);
}

/**
 * Compara dos valores de `NivelAcceso` directamente (sin pasar por claims),
 * con el mismo orden 'ninguno' < 'principiante' < 'avanzado' que usa
 * `hasNivel`. Devuelve `true` si `actual` alcanza o supera `requerido`.
 *
 * Dos usos reales de esta comparación "nivel contra nivel" (no "claims
 * contra nivel"), que por eso no pueden reusar `hasNivel` tal cual:
 *   - Auditoría de Mercado Pago: bloquear la recompra de un nivel igual o
 *     inferior al que el usuario ya tiene (`app/(app)/comprar/_actions.ts`).
 *   - Misma auditoría: la pantalla de espera post-checkout
 *     (`PendienteClient.tsx`) no debe confirmar la compra con sólo ver
 *     `nivel !== 'ninguno'` — eso ya era cierto ANTES de pagar para alguien
 *     que sube de Principiante a Avanzado. Confirma recién cuando el nivel
 *     alcanzado llega al nivel comprado.
 */
export function nivelAlcanzaOSupera(actual: NivelAcceso, requerido: NivelAcceso): boolean {
  return NIVEL_ORDEN[actual] >= NIVEL_ORDEN[requerido];
}
