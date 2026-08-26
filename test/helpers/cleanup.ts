// VGRP-43 — script de limpieza post-test, OBLIGATORIO por la decisión de
// entorno del ticket: como no hay una base de datos separada (mismo
// proyecto Supabase que la app, por costo), todo lo que un test crea tiene
// que quedar borrado al terminar. Corre automáticamente al final de
// `pnpm test` y `pnpm test:e2e` (ver test/global-teardown.ts y
// playwright.config.ts) y también queda disponible a mano: `pnpm test:cleanup`.
//
// El único criterio de "esto es de un test" es `isTestEmail()`
// (seed-users.ts): cualquier fila de `auth.users` con ese dominio. Nunca
// borra nada por otro criterio — es la única forma de que esto sea seguro
// corriendo contra el proyecto real.

import { createTestAdminClient } from "./db-client";
import { isTestEmail, SEED_USERS } from "./seed-users";

const SEED_EMAILS = new Set(SEED_USERS.map((u) => u.email));

/**
 * Borra un usuario de test puntual (típicamente uno creado con
 * `createAuthenticatedUser()`). Verifica el dominio de email ANTES de
 * borrar nada — corriendo contra el proyecto compartido, este chequeo es
 * lo único que impide borrar un usuario real por un bug en el caller.
 */
export async function cleanupUser(userId: string) {
  const admin = createTestAdminClient();

  const { data, error: getUserError } = await admin.auth.admin.getUserById(userId);
  if (getUserError) throw getUserError;
  if (!isTestEmail(data.user?.email)) {
    throw new Error(
      `Se intentó borrar el usuario ${userId} (${data.user?.email ?? "sin email"}), que NO ` +
        "tiene el dominio de test. Abortado — revisar qué llamó a esto.",
    );
  }

  // ON DELETE CASCADE en profiles.id -> auth.users.id (ver migración inicial)
  // se encarga de la fila de profiles. pagos referencia profiles sin cascade
  // (es un ledger append-only, ver el comentario en la migración), así que
  // sus filas quedarían huérfanas si no se borran antes.
  const { error: pagosError } = await admin.from("pagos").delete().eq("user_id", userId);
  if (pagosError) throw pagosError;

  const { error: deleteError } = await admin.auth.admin.deleteUser(userId);
  if (deleteError) throw deleteError;
}

/**
 * Barrido general: para todo usuario con email de test (`isTestEmail`),
 * borra sus filas de `pagos` (incluidos los 4 usuarios fijos del seed — un
 * pago que un test le insertó a un usuario seed sigue siendo residuo) y,
 * salvo que sea uno de los 4 del seed, borra también el usuario entero. Los
 * usuarios del seed quedan vivos a propósito: el seed es idempotente sobre
 * ellos (`pnpm db:seed:test` los recrea/corrige, nunca los duplica), así que
 * no son "residuo" — son el estado de partida esperado.
 *
 * `pagos` se borra en una sola query (`IN`) y los usuarios se borran en
 * paralelo: no hay necesidad de serializar N round-trips independientes
 * contra la API de Supabase.
 *
 * Es el teardown que corre automáticamente al final de la suite (VGRP-43,
 * criterio "nada queda residual"). Nunca toca un usuario sin el dominio de
 * test, sea cual sea el estado de la base.
 */
export async function cleanupAllTestArtifacts(): Promise<{ usersDeleted: number }> {
  const admin = createTestAdminClient();

  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;

  const testUsers = data.users.filter((u) => isTestEmail(u.email));
  if (testUsers.length === 0) return { usersDeleted: 0 };

  const { error: pagosError } = await admin
    .from("pagos")
    .delete()
    .in(
      "user_id",
      testUsers.map((u) => u.id),
    );
  if (pagosError) throw pagosError;

  const toDelete = testUsers.filter((u) => !(u.email && SEED_EMAILS.has(u.email)));
  const results = await Promise.all(toDelete.map((u) => admin.auth.admin.deleteUser(u.id)));
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;

  return { usersDeleted: toDelete.length };
}
