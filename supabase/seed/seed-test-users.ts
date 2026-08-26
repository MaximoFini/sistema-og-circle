// VGRP-43 — seed reproducible de usuarios de test.
//
// Idempotente: crea cada usuario seed si no existe, y si ya existe lo deja
// con el nivel/rol correctos en vez de fallar o duplicar. Correrlo dos veces
// (o cien) da el mismo resultado.
//
// Uso: pnpm db:seed:test (ver package.json). Requiere NEXT_PUBLIC_SUPABASE_URL
// (ya la usa la app) y SUPABASE_SERVICE_ROLE_KEY — ver docs/TESTING.md. El
// guard de producción corre adentro de createTestAdminClient(), antes de
// cualquier llamada a la API de Supabase.

import { applyNivelRol, createTestAdminClient } from "../../test/helpers/db-client";
import { SEED_USERS } from "../../test/helpers/seed-users";

async function upsertSeedUser(
  admin: ReturnType<typeof createTestAdminClient>,
  existingByEmail: Map<string, { id: string }>,
  user: (typeof SEED_USERS)[number],
) {
  let userId: string;

  const existing = existingByEmail.get(user.email);
  if (existing) {
    userId = existing.id;
    console.log(`  = ${user.email} ya existe (${userId}), no se recrea`);
  } else {
    const { data, error } = await admin.auth.admin.createUser({
      email: user.email,
      password: user.password,
      email_confirm: true,
    });
    if (error) throw error;
    userId = data.user.id;
    console.log(`  + ${user.email} creado (${userId})`);
  }

  // El trigger on_auth_user_created (supabase/migrations/…init_plataforma.sql)
  // ya insertó la fila en profiles con nivel='ninguno'/rol='user'. applyNivelRol
  // la pisa con service role para dejar cada usuario seed en el nivel/rol que
  // le corresponde, reflejado también en app_metadata para que el próximo
  // login emita el JWT con el claim correcto.
  await applyNivelRol(admin, userId, user.nivel, user.rol);
}

async function main() {
  const admin = createTestAdminClient();

  // Una sola lectura de auth.users para los 4 usuarios del seed, en vez de
  // una por usuario: la base de test tiene un puñado de usuarios (los del
  // seed + los que cree cada corrida de tests), nunca miles, así que una
  // sola página alcanza sin necesidad de paginar.
  const { data, error } = await admin.auth.admin.listUsers({ perPage: 1000 });
  if (error) throw error;
  const existingByEmail = new Map(data.users.filter((u) => u.email).map((u) => [u.email as string, u]));

  console.log(`Sembrando ${SEED_USERS.length} usuarios de test...`);
  for (const user of SEED_USERS) {
    await upsertSeedUser(admin, existingByEmail, user);
  }
  console.log("Seed completo.");
}

main().catch((error) => {
  console.error("Seed de test falló:", error);
  process.exit(1);
});
