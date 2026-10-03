// VGRP-62 — cuenta de cobro de PRUEBA, para que los E2E de VGRP-64, 65 y 66 (y
// los tests de este ticket) tengan a dónde "transferir" sin datos reales.
//
// ⚠️ NO HAY BASE DE TEST SEPARADA (docs/TESTING.md): estos helpers escriben en
// el mismo proyecto de Supabase que usan los usuarios reales. Dejar una cuenta
// de prueba ACTIVA ahí significa que, el día que /comprar muestre la cuenta
// activa (VGRP-64), un usuario real vería un CBU falso. Por eso:
//   - la cuenta de prueba es inconfundible (titular con el marcador "[test]" y
//     una nota que dice que no se transfiera);
//   - `sembrarCuentaCobroDeTest()` NUNCA desplaza una cuenta activa real: si ya
//     hay una que no es de test, se niega a activar nada y tira un error;
//   - `limpiarCuentasDeTest()` la borra al terminar (el teardown de vitest la
//     llama), y los E2E que la usen tienen que correr su propio cleanup.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { Database } from "../../lib/database.types";
import { MARCADOR_CONTENIDO_TEST } from "./cleanup";

/** Prefijo que identifica a TODA cuenta de cobro creada por un test. Nunca crear
 *  una cuenta de test sin él: es lo único que hace seguro limpiar la tabla. Es el
 *  mismo marcador que usa la limpieza del contenido (cleanup.ts). */
export const MARCADOR_CUENTA_TEST = MARCADOR_CONTENIDO_TEST;

export const CUENTA_COBRO_TEST = {
  titular: `${MARCADOR_CUENTA_TEST} OG Circle (cuenta de prueba)`,
  // CUIT con dígito verificador válido y CBU de 22 dígitos que no corresponde
  // a ninguna cuenta real.
  cuit: "20123456786",
  banco: "Banco de prueba",
  cbu_cvu: "0000000000000000000001",
  alias: "og.circle.prueba",
  notas: "Cuenta de prueba: NO transferir dinero.",
} as const;

type Admin = SupabaseClient<Database>;

/** ¿Hay una cuenta activa que NO es de test? (la de verdad, la que ven los usuarios). */
export async function hayCuentaActivaReal(admin: Admin): Promise<boolean> {
  const { data, error } = await admin
    .from("cuentas_cobro")
    .select("id, titular")
    .eq("activa", true)
    .maybeSingle();
  if (error) throw error;
  return data !== null && !data.titular.startsWith(MARCADOR_CUENTA_TEST);
}

/**
 * Crea (si falta) la cuenta de prueba y la deja ACTIVA. Idempotente. Se niega a
 * correr si hay una cuenta activa real: no se la desplaza jamás.
 */
export async function sembrarCuentaCobroDeTest(admin: Admin): Promise<{ id: string }> {
  if (await hayCuentaActivaReal(admin)) {
    throw new Error(
      "Hay una cuenta de cobro activa que no es de test: no se activa la cuenta de prueba " +
        "para no desplazarla (la verían los usuarios reales).",
    );
  }

  const { data: existente, error: errorLectura } = await admin
    .from("cuentas_cobro")
    .select("id")
    .eq("titular", CUENTA_COBRO_TEST.titular)
    .maybeSingle();
  if (errorLectura) throw errorLectura;

  let id = existente?.id;
  if (!id) {
    const { data, error } = await admin
      .from("cuentas_cobro")
      .insert({ ...CUENTA_COBRO_TEST, activa: false })
      .select("id")
      .single();
    if (error) throw error;
    id = data.id;
  }

  const { error: errorActivar } = await admin.rpc("activar_cuenta_cobro", { p_id: id });
  if (errorActivar) throw errorActivar;
  return { id };
}

/**
 * Borra toda cuenta cuyo titular empiece con el marcador. Si un comprobante
 * (FK de VGRP-63) referencia alguna, el borrado falla entero (23503): entonces
 * se las deja INACTIVAS, que es lo que importa (que no la vea ningún usuario).
 */
export async function limpiarCuentasDeTest(admin: Admin): Promise<{ filasLimpiadas: number }> {
  const patron = `${MARCADOR_CUENTA_TEST}%`;

  const { data, error } = await admin
    .from("cuentas_cobro")
    .delete()
    .like("titular", patron)
    .select("id");
  if (!error) return { filasLimpiadas: data.length };
  if (error.code !== "23503") throw error;

  const { data: desactivadas, error: errorDesactivar } = await admin
    .from("cuentas_cobro")
    .update({ activa: false })
    .like("titular", patron)
    .select("id");
  if (errorDesactivar) throw errorDesactivar;
  return { filasLimpiadas: desactivadas.length };
}
