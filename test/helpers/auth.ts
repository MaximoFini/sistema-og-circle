// VGRP-43 — helpers de autenticación para tests de integración/E2E.

import type { NivelAcceso, RolUsuario } from "../../lib/database.types";
import { applyNivelRol, createTestAdminClient, createTestAnonClient } from "./db-client";
import { findSeedUser, type SeedUserDefinition, TEST_EMAIL_SUFFIX } from "./seed-users";
import { withAuthRetry } from "./with-auth-retry";

/**
 * Crea un usuario autenticado nuevo (no uno de los del seed) con el nivel
 * (y opcionalmente rol) dado, y devuelve su sesión ya logueada. Pensado para
 * tests que necesitan un usuario "limpio" propio en vez de compartir los 4
 * usuarios fijos del seed — por ejemplo, un test que borra o modifica el
 * usuario.
 *
 * El caller es responsable de llamar a `cleanupUser(userId)` al terminar
 * (ver cleanup.ts) para no dejar residuos entre corridas.
 */
export async function createAuthenticatedUser(
  nivel: NivelAcceso,
  rol: RolUsuario = "user",
  password = "test-password-1!",
) {
  const admin = createTestAdminClient();
  const email = `helper-${crypto.randomUUID()}${TEST_EMAIL_SUFFIX}`;

  const { data: created, error: createError } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password, email_confirm: true }),
  );
  if (createError) throw createError;

  await applyNivelRol(admin, created.user.id, nivel, rol);

  const anon = createTestAnonClient();
  const { data: session, error: signInError } = await withAuthRetry(() =>
    anon.auth.signInWithPassword({ email, password }),
  );
  if (signInError) throw signInError;

  return {
    userId: created.user.id,
    email,
    accessToken: session.session?.access_token ?? null,
  };
}

/**
 * Devuelve un access token real (JWT firmado por Supabase) para el usuario
 * seed del `nivel` pedido, logueándose con las credenciales fijas del seed
 * (test/helpers/seed-users.ts). Sirve para probar que un claim específico
 * llega correctamente sin tener que fabricar un JWT a mano — cosa que acá no
 * se hace a propósito: las claves de firma (ES256) son del proyecto real y
 * no están pensadas para simularse en tests (ver docs/AUTH.md).
 *
 * Requiere haber corrido el seed (`pnpm db:seed:test`) contra la base de
 * test antes.
 */
export async function getTokenWithClaim(nivel: NivelAcceso): Promise<{
  accessToken: string;
  user: SeedUserDefinition;
}> {
  const user = findSeedUser(nivel);
  const anon = createTestAnonClient();

  const { data, error } = await withAuthRetry(() =>
    anon.auth.signInWithPassword({ email: user.email, password: user.password }),
  );
  if (error) {
    throw new Error(
      `No se pudo loguear con el usuario seed de nivel "${nivel}" (${user.email}). ` +
        `¿Corriste "pnpm db:seed:test" contra esta base? Error original: ${error.message}`,
    );
  }

  const accessToken = data.session?.access_token;
  if (!accessToken) {
    throw new Error(`Login del usuario seed "${user.email}" no devolvió session.access_token.`);
  }

  return { accessToken, user };
}
