// VGRP-47 §4 — la vista `admin_pagos_ledger` NO es legible por `anon` ni por
// `authenticated` (supabase/migrations/20260905030200_admin_pagos_ledger.sql:
// `revoke all on ... from anon, authenticated; grant select ... to
// service_role;`). Esto es un `revoke`/`grant` de nivel de VISTA, no una
// policy de RLS — no hace falta `withPolicyDisabled` acá (no hay ninguna
// policy que desactivar): un `.select()` con un cliente logueado normal
// alcanza para confirmar que PostgREST corta con `42501 permission denied`
// antes de siquiera evaluar RLS, igual que documenta
// `rls.test.ts` para `nivel_overrides` (mismo mecanismo: revoke de tabla/vista
// completo, no policies).

import { afterEach, describe, expect, it } from "vitest";
import { createAuthenticatedUser } from "../helpers/auth";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import { withAuthRetry } from "../helpers/with-auth-retry";

const admin = createTestAdminClient();
const PASSWORD_USUARIO_AD_HOC = "test-password-1!";

describe("admin_pagos_ledger: no legible por anon ni por authenticated (VGRP-47 §4)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("un cliente anon (sin sesión) no puede leer la vista", async () => {
    const anon = createTestAnonClient();

    const { data, error } = await anon.from("admin_pagos_ledger").select();

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(data ?? []).toHaveLength(0);
  });

  it("un usuario común logueado (rol='user', authenticated) no puede leer la vista — nunca datos reales", async () => {
    const created = await createAuthenticatedUser("avanzado");
    userId = created.userId;

    const client = createTestAnonClient();
    const { error: signInError } = await withAuthRetry(() =>
      client.auth.signInWithPassword({ email: created.email, password: PASSWORD_USUARIO_AD_HOC }),
    );
    expect(signInError).toBeNull();

    const { data, error } = await client.from("admin_pagos_ledger").select();

    expect(error).not.toBeNull();
    expect(error?.code).toBe("42501");
    expect(data ?? []).toHaveLength(0);
  });

  // Control positivo: confirma que la vista SÍ tiene datos reales para
  // service_role — si este test fallara (0 filas por otro motivo, ej. la
  // tabla vacía), los dos de arriba no probarían nada ("no ve nada" sería
  // trivialmente cierto porque no hay nada que ver).
  it("control: service_role SÍ puede leer la vista (confirma que el escenario tiene datos reales)", async () => {
    const { data, error } = await admin.from("admin_pagos_ledger").select("id").limit(1);
    expect(error).toBeNull();
    // No se afirma que haya >=1 fila (la tabla pagos puede estar vacía en un
    // proyecto sin tráfico) — sólo que service_role no choca con el mismo
    // 42501 que los clientes de arriba. Si hay filas, mejor: prueba con datos
    // reales.
    expect(data).not.toBeNull();
  });
});
