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
import { withAuthRetry } from "./with-auth-retry";

const SEED_EMAILS = new Set(SEED_USERS.map((u) => u.email));

/**
 * Borra, para un solo `userId`, todas las filas que lo referencian por FK
 * sin cascada antes de poder borrar el usuario:
 * - `pagos.user_id` -> `profiles.id` (ledger append-only, sin cascade).
 * - `admin_audit_log.actor_id` -> `profiles.id` (sin cascade, ver la
 *   migración inicial) — si un test simula una acción de admin, el usuario
 *   que quedó como `actor_id` no se puede borrar hasta borrar antes su fila
 *   de auditoría, o el DELETE de auth.users falla por violación de FK y
 *   corta toda la limpieza a mitad de camino.
 * - `nivel_overrides.user_id` Y `nivel_overrides.actor_id` -> `profiles.id`
 *   (VGRP-36, sin cascade — misma trampa que `pagos`/`admin_audit_log`). Un
 *   test de activación manual deja una fila que referencia al usuario objetivo
 *   por `user_id` y al admin por `actor_id`; hay que borrar por las dos
 *   columnas antes de tocar `auth.users`.
 * `profiles` la borra sola el ON DELETE CASCADE de `profiles.id -> auth.users.id`.
 */
async function deleteFkDependents(admin: ReturnType<typeof createTestAdminClient>, userId: string) {
  const { error: overridesUserError } = await admin
    .from("nivel_overrides")
    .delete()
    .eq("user_id", userId);
  if (overridesUserError) throw overridesUserError;

  const { error: overridesActorError } = await admin
    .from("nivel_overrides")
    .delete()
    .eq("actor_id", userId);
  if (overridesActorError) throw overridesActorError;

  const { error: auditError } = await admin.from("admin_audit_log").delete().eq("actor_id", userId);
  if (auditError) throw auditError;

  const { error: pagosError } = await admin.from("pagos").delete().eq("user_id", userId);
  if (pagosError) throw pagosError;
}

/**
 * Borra un usuario de test puntual (típicamente uno creado con
 * `createAuthenticatedUser()`). Verifica el dominio de email ANTES de
 * borrar nada — corriendo contra el proyecto compartido, este chequeo es
 * lo único que impide borrar un usuario real por un bug en el caller.
 */
export async function cleanupUser(userId: string) {
  const admin = createTestAdminClient();

  const { data, error: getUserError } = await withAuthRetry(() =>
    admin.auth.admin.getUserById(userId),
  );
  if (getUserError) throw getUserError;
  if (!isTestEmail(data.user?.email)) {
    throw new Error(
      `Se intentó borrar el usuario ${userId} (${data.user?.email ?? "sin email"}), que NO ` +
        "tiene el dominio de test. Abortado — revisar qué llamó a esto.",
    );
  }

  await deleteFkDependents(admin, userId);

  const { error: deleteError } = await withAuthRetry(() => admin.auth.admin.deleteUser(userId));
  if (deleteError) throw deleteError;
}

/**
 * Barrido general: para todo usuario con email de test (`isTestEmail`),
 * borra sus filas de `pagos` y `admin_audit_log` (incluidos los 4 usuarios
 * fijos del seed — un pago o una entrada de auditoría que un test le insertó
 * a un usuario seed sigue siendo residuo) y, salvo que sea uno de los 4 del
 * seed, borra también el usuario entero. Los usuarios del seed quedan vivos
 * a propósito: el seed es idempotente sobre ellos (`pnpm db:seed:test` los
 * recrea/corrige, nunca los duplica), así que no son "residuo" — son el
 * estado de partida esperado.
 *
 * Excepción: el pago sintético `proveedor='seed'` que `seed-test-users.ts`
 * le inserta a los usuarios seed de nivel pago (para que `nivel_vigente()`
 * coincida con `profiles.nivel`) NO se borra — es parte de ese estado de
 * partida. Todo lo demás en `pagos` de un usuario seed sí se limpia.
 *
 * `pagos`/`admin_audit_log` se borran en una sola query cada uno (`IN`) y
 * los usuarios se borran en paralelo: no hay necesidad de serializar N
 * round-trips independientes contra la API de Supabase.
 *
 * Es el teardown que corre automáticamente al final de la suite (VGRP-43,
 * criterio "nada queda residual"). Nunca toca un usuario sin el dominio de
 * test, sea cual sea el estado de la base.
 */
export async function cleanupAllTestArtifacts(): Promise<{ usersDeleted: number }> {
  const admin = createTestAdminClient();

  const { data, error } = await withAuthRetry(() => admin.auth.admin.listUsers({ perPage: 1000 }));
  if (error) throw error;

  const testUsers = data.users.filter((u) => isTestEmail(u.email));
  if (testUsers.length === 0) return { usersDeleted: 0 };

  const testUserIds = testUsers.map((u) => u.id);
  // Los 4 usuarios seed no se borran; sus filas hijas SÍ se vacían salvo el
  // pago sintético `proveedor='seed'` que `seed-test-users.ts` les inserta
  // para que `nivel_vigente()` coincida con `profiles.nivel` — ese es estado
  // de partida, no residuo (ver el comentario de la función).
  const seedUserIds = testUsers
    .filter((u) => u.email && SEED_EMAILS.has(u.email))
    .map((u) => u.id);
  const seedUserIdSet = new Set(seedUserIds);
  const adHocUserIds = testUserIds.filter((id) => !seedUserIdSet.has(id));

  // Van antes de borrar ningún usuario: admin_audit_log.actor_id,
  // pagos.user_id y nivel_overrides.{user_id,actor_id} son FKs sin cascade a
  // profiles — dejarlas colgadas rompe el DELETE de auth.users con una
  // violación de FK.
  const { error: overridesUserError } = await admin
    .from("nivel_overrides")
    .delete()
    .in("user_id", testUserIds);
  if (overridesUserError) throw overridesUserError;

  const { error: overridesActorError } = await admin
    .from("nivel_overrides")
    .delete()
    .in("actor_id", testUserIds);
  if (overridesActorError) throw overridesActorError;

  const { error: auditError } = await admin
    .from("admin_audit_log")
    .delete()
    .in("actor_id", testUserIds);
  if (auditError) throw auditError;

  // Usuarios ad-hoc: todos sus pagos (se van a borrar enteros abajo).
  if (adHocUserIds.length > 0) {
    const { error: pagosAdHocError } = await admin
      .from("pagos")
      .delete()
      .in("user_id", adHocUserIds);
    if (pagosAdHocError) throw pagosAdHocError;
  }
  // Usuarios seed: solo lo que insertó un test (todo menos el pago sintético
  // del seed), para que el estado de partida sobreviva a la limpieza.
  if (seedUserIds.length > 0) {
    const { error: pagosSeedError } = await admin
      .from("pagos")
      .delete()
      .in("user_id", seedUserIds)
      .neq("proveedor", "seed");
    if (pagosSeedError) throw pagosSeedError;
  }

  const toDelete = testUsers.filter((u) => !(u.email && SEED_EMAILS.has(u.email)));
  const results = await Promise.all(
    toDelete.map((u) => withAuthRetry(() => admin.auth.admin.deleteUser(u.id))),
  );
  const failed = results.find((r) => r.error);
  if (failed?.error) throw failed.error;

  return { usersDeleted: toDelete.length };
}
