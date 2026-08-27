// VGRP-44 — desactivar UNA policy de RLS puntual, correr una aserción, y
// garantizar que se recreó al terminar. Es el mecanismo que pide el criterio
// de aceptación "Verificación de que los tests sirven": escribir el mismo
// `expect` que usa el test real pero envuelto en `withPolicyDisabled`, y
// confirmar que ahora SÍ pasa — sin la policy, cualquiera lee/escribe
// cualquier fila, así que si el `expect` sigue fallando ahí adentro es que el
// test no estaba probando lo que creíamos.
//
// Por qué esto necesita RPC en la base (ver la migración
// supabase/migrations/20260827161404_test_rls_toggle_helpers.sql, aplicada
// contra el proyecto real): supabase-js no expone ejecución de SQL
// arbitrario, sólo CRUD sobre tablas y llamadas a funciones ya definidas.
// Desactivar una sola policy sin tocar las demás tampoco tiene un comando
// directo en Postgres (no existe "ALTER POLICY ... DISABLE") — la única
// forma es borrarla y volver a crearla idéntica, así que hace falta leer su
// definición completa ANTES de borrar nada.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";

type AdminClient = SupabaseClient<Database>;
type PolicyDefinition =
  Database["public"]["Functions"]["test_get_policy_definition"]["Returns"][number];

async function getPolicyDefinition(
  admin: AdminClient,
  schema: string,
  table: string,
  policy: string,
): Promise<PolicyDefinition> {
  const { data, error } = await admin.rpc("test_get_policy_definition", {
    p_schema: schema,
    p_table: table,
    p_policy: policy,
  });

  if (error) throw new Error(`test_get_policy_definition falló: ${error.message}`);

  const row = data?.[0];
  if (!row) {
    throw new Error(
      `No existe la policy "${policy}" en ${schema}.${table}. Revisá el nombre contra la ` +
        "migración correspondiente o `select policyname from pg_policies where tablename = " +
        `'${table}'\`.`,
    );
  }
  return row;
}

/**
 * Desactiva `policy` en `schema.table`, corre `fn()`, y la recrea idéntica al
 * terminar — pase lo que pase adentro de `fn` (éxito, `expect` que falla, o
 * excepción). Uso típico en un test de VGRP-44:
 *
 * ```ts
 * it("SIN la policy, el usuario B SÍ puede leer profiles de otro (confirma que la policy real protege)", async () => {
 *   await withPolicyDisabled(admin, "public", "profiles", "profiles_select_own", async () => {
 *     const anon = createTestAnonClient();
 *     await anon.auth.signInWithPassword({ email: userB.email, password: userB.password });
 *     const { data } = await anon.from("profiles").select().eq("id", userA.userId);
 *     expect(data).toHaveLength(1); // con la policy activa este mismo assert da 0 filas
 *   });
 * });
 * ```
 *
 * Si la recreación al final falla, esto NO se traga el error en un catch
 * silencioso: tirar una excepción bien visible es preferible a dejar el
 * proyecto real con una policy de RLS desactivada sin que nadie se entere —
 * eso es un incidente de seguridad, no una falla de test más. El mensaje
 * incluye la definición completa para poder recrearla a mano de inmediato.
 */
export async function withPolicyDisabled<T>(
  admin: AdminClient,
  schema: string,
  table: string,
  policy: string,
  fn: () => Promise<T>,
): Promise<T> {
  const definition = await getPolicyDefinition(admin, schema, table, policy);

  const { error: dropError } = await admin.rpc("test_drop_policy", {
    p_schema: schema,
    p_table: table,
    p_policy: policy,
  });
  if (dropError) throw new Error(`test_drop_policy falló: ${dropError.message}`);

  // Nada de `throw` dentro de un `finally`: si `fn()` lanzara y la
  // recreación de la policy también fallara, un `throw` en el `finally` se
  // comería en silencio el error original de `fn()` (biome lo marca como
  // `noUnsafeFinally`, con razón). Por eso acá se separa a mano: se intenta
  // recrear tanto si `fn()` tuvo éxito como si no, y si las dos cosas
  // fallaron se reportan las dos juntas en vez de perder una. `outcome` como
  // union (en vez de dos variables sueltas) es lo que le permite a TS saber,
  // en la rama de éxito de más abajo, que `value` sí está asignado — sin
  // necesitar un `result!`.
  type Outcome = { ok: true; value: T } | { ok: false; error: unknown };
  let outcome: Outcome;
  try {
    outcome = { ok: true, value: await fn() };
  } catch (error) {
    outcome = { ok: false, error };
  }

  const { error: recreateError } = await admin.rpc("test_create_policy", {
    p_schema: schema,
    p_table: table,
    p_policy: policy,
    p_permissive: definition.permissive,
    p_roles: definition.roles,
    p_cmd: definition.cmd,
    p_qual: definition.qual,
    p_with_check: definition.with_check,
  });

  if (recreateError) {
    const detalleFn = outcome.ok ? "" : ` Además, fn() había lanzado: ${String(outcome.error)}.`;
    throw new Error(
      `CRÍTICO: no se pudo recrear la policy "${policy}" en ${schema}.${table} después de ` +
        "desactivarla para un test — el proyecto real quedó con esa tabla sin esa protección " +
        `de RLS. Recrearla A MANO ya mismo con: ${JSON.stringify(definition)}. ` +
        `Causa original: ${recreateError.message}.${detalleFn}`,
    );
  }

  if (!outcome.ok) throw outcome.error;
  return outcome.value;
}
