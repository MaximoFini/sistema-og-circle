// VGRP-43 — cliente de Supabase para tests de integración/E2E, el seed y la
// limpieza.
//
// Decisión de entorno (actualizada, ver el ticket): mientras el proyecto no
// facture, esto apunta al MISMO proyecto Supabase que usa la app en runtime
// (`NEXT_PUBLIC_SUPABASE_URL` / `NEXT_PUBLIC_SUPABASE_ANON_KEY`) — no hay
// branch ni proyecto separado por costo. `SUPABASE_SERVICE_ROLE_KEY` es la
// única variable nueva: no la usa la app (nunca debe llegar al bundle de
// cliente), solo scripts de servidor como este.
//
// Ver docs/TESTING.md para qué implica correr contra el proyecto real y por
// qué TODO dato de test tiene que quedar identificable (isTestEmail en
// seed-users.ts) para que cleanup.ts lo pueda borrar después.

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import type { Database, NivelAcceso, RolUsuario } from "../../lib/database.types";
import { getEnv } from "../../lib/env";
import "./load-env";
import { assertNotProductionDatabase } from "./production-guard";

const TEST_HINT =
  "Los tests que tocan base de datos necesitan las mismas variables de Supabase " +
  "que la app, más SUPABASE_SERVICE_ROLE_KEY — ver docs/TESTING.md.";

/**
 * Chequeo positivo, no solo negativo: además de que la URL no sea la de
 * producción (`assertNotProductionDatabase`, que hoy es un no-op mientras no
 * exista un proyecto de producción separado), exigimos una marca explícita de
 * "esto es una corrida de test". Vitest la setea solo (`NODE_ENV=test` es su
 * default); `pnpm test:e2e`/`pnpm db:seed:test`/`pnpm test:cleanup` la fuerzan
 * en package.json vía `cross-env`. Sin esto, un `next dev`/`next build` normal
 * que por accidente importara este módulo tendría luz verde para crear el
 * cliente admin — con el chequeo, hace falta la marca Y que no sea producción.
 */
function assertTestRuntime(): void {
  if (process.env.NODE_ENV !== "test") {
    throw new Error(
      "createTestAdminClient()/createTestAnonClient() se llamaron fuera de un " +
        `contexto de test (NODE_ENV="${process.env.NODE_ENV ?? "undefined"}", se esperaba "test"). ` +
        "Esto nunca debe usarse desde código de la app — ver docs/TESTING.md.",
    );
  }
}

/**
 * Cliente con la service role key: bypassea RLS a propósito, porque el seed
 * y los helpers de test necesitan escribir `nivel`/`rol` directo (cosas que
 * ningún usuario real puede hacer por RLS — ver supabase/migrations). Nunca
 * usar este cliente en código de la app, solo en test/ y en el seed/limpieza.
 */
export function createTestAdminClient() {
  assertTestRuntime();

  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL", TEST_HINT);
  const serviceRoleKey = getEnv("SUPABASE_SERVICE_ROLE_KEY", TEST_HINT);

  assertNotProductionDatabase(url);

  return createClient<Database>(url, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/** Cliente anon, para simular lo que ve un usuario real (login, JWT, RLS). */
export function createTestAnonClient() {
  assertTestRuntime();

  const url = getEnv("NEXT_PUBLIC_SUPABASE_URL", TEST_HINT);
  const anonKey = getEnv("NEXT_PUBLIC_SUPABASE_ANON_KEY", TEST_HINT);

  assertNotProductionDatabase(url);

  return createClient<Database>(url, anonKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
}

/**
 * Aplica `nivel`/`rol` a un usuario ya existente en `auth.users`: pisa
 * `profiles` (bypasseando RLS con el cliente admin) y refleja lo mismo en
 * `app_metadata` para que el próximo login emita el JWT con el claim
 * correcto. Paso compartido entre el seed (`supabase/seed/seed-test-users.ts`)
 * y `createAuthenticatedUser()` (`test/helpers/auth.ts`) — ambos crean un
 * usuario y después necesitan exactamente esto.
 */
export async function applyNivelRol(
  admin: SupabaseClient<Database>,
  userId: string,
  nivel: NivelAcceso,
  rol: RolUsuario,
): Promise<void> {
  const { error: profileError } = await admin
    .from("profiles")
    .update({ nivel, rol })
    .eq("id", userId);
  if (profileError) throw profileError;

  const { error: metadataError } = await admin.auth.admin.updateUserById(userId, {
    app_metadata: { nivel, rol },
  });
  if (metadataError) throw metadataError;
}
