// VGRP-62 — `cuentas_cobro` no es legible ni escribible con la anon key ni con
// el JWT de un usuario común (default-deny: RLS activa y SIN policies, igual que
// `nivel_overrides`). Contra el proyecto real de Supabase (no hay base de test
// separada, docs/TESTING.md).
//
// Regla de este archivo (la misma de rls.test.ts): las ASERCIONES van siempre
// con el cliente del usuario real o el anon; el cliente admin sólo arma la fila
// de prueba y la limpia — service_role bypasea RLS, así que no sirve para
// afirmar nada acá.
//
// Un solo usuario, un solo login y una sola fila para todo el archivo: ningún
// test deja una mutación que importe (todos afirman que se RECHAZA), y crear un
// usuario por test chocaría con el rate limit de Supabase Auth.

import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { createAuthenticatedUser } from "../helpers/auth";
import { cleanupUser } from "../helpers/cleanup";
import { CUENTA_COBRO_TEST, limpiarCuentasDeTest } from "../helpers/cuenta-cobro-seed";
import { createTestAdminClient, createTestAnonClient } from "../helpers/db-client";
import { withAuthRetry } from "../helpers/with-auth-retry";

const admin = createTestAdminClient();
const PASSWORD_USUARIO_AD_HOC = "test-password-1!";

describe("cuentas_cobro: default-deny para anon y authenticated (VGRP-62)", () => {
  let cuentaId: string;
  let userId: string;
  let usuario: ReturnType<typeof createTestAnonClient>;
  const anon = createTestAnonClient();

  beforeAll(async () => {
    const { data, error } = await admin
      .from("cuentas_cobro")
      .insert({ ...CUENTA_COBRO_TEST, activa: false })
      .select("id")
      .single();
    if (error) throw error;
    cuentaId = data.id;

    const created = await createAuthenticatedUser("ninguno");
    userId = created.userId;
    usuario = createTestAnonClient();
    const { error: errorLogin } = await withAuthRetry(() =>
      usuario.auth.signInWithPassword({ email: created.email, password: PASSWORD_USUARIO_AD_HOC }),
    );
    if (errorLogin) throw errorLogin;
  });

  afterAll(async () => {
    await limpiarCuentasDeTest(admin);
    if (userId) await cleanupUser(userId);
  });

  it("un cliente anon no lee ninguna fila", async () => {
    const { data } = await anon.from("cuentas_cobro").select("*");

    // Sin grant a `anon`, PostgREST responde con error de permisos; con grant y
    // sin policy, devolvería 0 filas. Cualquiera de los dos es "no lee nada".
    expect(data ?? []).toEqual([]);
  });

  it("un usuario authenticated común no lee ninguna fila", async () => {
    const { data } = await usuario.from("cuentas_cobro").select("*");

    expect(data ?? []).toEqual([]);
  });

  it("un usuario authenticated no puede insertar una cuenta", async () => {
    const { error } = await usuario.from("cuentas_cobro").insert({
      ...CUENTA_COBRO_TEST,
      titular: `${CUENTA_COBRO_TEST.titular} (insert ajeno)`,
    });

    expect(error).not.toBeNull();
    const { count } = await admin
      .from("cuentas_cobro")
      .select("*", { count: "exact", head: true })
      .like("titular", "%(insert ajeno)");
    expect(count).toBe(0);
  });

  it("un usuario authenticated no puede cambiar el CBU de una cuenta existente", async () => {
    await usuario
      .from("cuentas_cobro")
      .update({ cbu_cvu: "9999999999999999999999" })
      .eq("id", cuentaId);

    const { data } = await admin
      .from("cuentas_cobro")
      .select("cbu_cvu")
      .eq("id", cuentaId)
      .single();
    expect(data?.cbu_cvu).toBe(CUENTA_COBRO_TEST.cbu_cvu);
  });

  it("un usuario authenticated no puede borrar una cuenta", async () => {
    await usuario.from("cuentas_cobro").delete().eq("id", cuentaId);

    const { data } = await admin.from("cuentas_cobro").select("id").eq("id", cuentaId);
    expect(data).toHaveLength(1);
  });

  it("anon y authenticated no pueden ejecutar activar_cuenta_cobro()", async () => {
    const { error: errorAnon } = await anon.rpc("activar_cuenta_cobro", { p_id: cuentaId });
    const { error: errorUsuario } = await usuario.rpc("activar_cuenta_cobro", { p_id: cuentaId });

    expect(errorAnon).not.toBeNull();
    expect(errorUsuario).not.toBeNull();
    const { data } = await admin.from("cuentas_cobro").select("activa").eq("id", cuentaId).single();
    expect(data?.activa).toBe(false);
  });
});
