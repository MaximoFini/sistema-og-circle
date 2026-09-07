// VGRP-47 §5 — casos que faltan en la matriz de `sin_aplicar` de la vista
// `admin_pagos_ledger` (supabase/migrations/20260905030200_admin_pagos_ledger.sql).
// Contra Postgres real: la lógica vive en la vista SQL, no en JS, así que no
// hay forma honesta de probar esto sin pegarle a la base.
//
// Recordatorio de la fórmula (ver el comentario largo de la migración):
//   sin_aplicar = estado='approved'
//     AND NOT EXISTS (refunded para el mismo proveedor_ref)
//     AND nivel_comprado > nivel actual del perfil
//     AND NOT EXISTS (override posterior al pago)
//
// Los dos casos de acá ejercitan el segundo y el tercer término por separado
// de lo que ya cubre `pagos.test.ts`/`usuarios.test.ts` existentes.

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { cleanupUser } from "../../../test/helpers/cleanup";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import { proyectarNivel } from "../pagos";
import { listarPagos } from "./pagos";
import "../../../test/helpers/load-env";
import { TEST_EMAIL_SUFFIX } from "../../../test/helpers/seed-users";
import { withAuthRetry } from "../../../test/helpers/with-auth-retry";

const admin = createTestAdminClient();

async function crearUsuarioDeTest(prefijo: string): Promise<string> {
  const email = `${prefijo}-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: "test-password-1!", email_confirm: true }),
  );
  if (error) throw error;
  return data.user.id;
}

async function buscarFilaLedger(userId: string, proveedorRef: string) {
  const { pagos } = await listarPagos(admin, { proveedorRef, limit: 100 });
  const fila = pagos.find((p) => p.user_id === userId && p.proveedor_ref === proveedorRef);
  if (!fila) throw new Error(`No se encontró la fila del ledger para ${proveedorRef}`);
  return fila;
}

describe("admin_pagos_ledger.sin_aplicar — matriz de casos faltantes (VGRP-47 §5)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("un refunded de OTRO proveedor_ref no tapa el approved original (el refund es de una referencia distinta, irrelevante para este pago)", async () => {
    userId = await crearUsuarioDeTest("sinaplicar-refund-otra-ref");
    const refOriginal = `test-ref-${randomUUID()}`;
    const refDistinta = `test-ref-otra-${randomUUID()}`;

    // Pago approved que sube a "avanzado" — el usuario arranca en "ninguno",
    // así que nivel_comprado > nivel actual del perfil se cumple.
    const { error: insertOriginalError } = await admin.from("pagos").insert({
      user_id: userId,
      proveedor: "mercadopago",
      proveedor_ref: refOriginal,
      nivel_comprado: "avanzado",
      monto_ars: 5000,
      estado: "approved",
      payload_raw: {},
    });
    if (insertOriginalError) throw insertOriginalError;

    // Refund de una referencia COMPLETAMENTE distinta — no debería afectar en
    // absoluto al pago de arriba (el anti-join de la vista correlaciona por
    // proveedor_ref, no por usuario).
    const { error: insertRefundError } = await admin.from("pagos").insert({
      user_id: userId,
      proveedor: "mercadopago",
      proveedor_ref: refDistinta,
      nivel_comprado: "principiante",
      monto_ars: 1000,
      estado: "refunded",
      payload_raw: {},
    });
    if (insertRefundError) throw insertRefundError;

    // A propósito NO se llama a proyectarNivel: queremos que profiles.nivel
    // siga en "ninguno" (el webhook "falló en aplicarlo") para que el pago
    // aprobado quede genuinamente sin_aplicar, y sea ESE caso el que
    // confirmamos que el refund de otra referencia no tapa.
    const filaOriginal = await buscarFilaLedger(userId, refOriginal);
    expect(filaOriginal.estado).toBe("approved");
    expect(filaOriginal.sin_aplicar).toBe(true);

    // Control: el pago refunded en sí nunca se marca sin_aplicar (no es
    // approved).
    const filaRefund = await buscarFilaLedger(userId, refDistinta);
    expect(filaRefund.sin_aplicar).toBe(false);
  });

  it("un pago approved de nivel MENOR al nivel actual del perfil no se marca sin_aplicar (ya está cubierto por el nivel superior vigente)", async () => {
    userId = await crearUsuarioDeTest("sinaplicar-nivel-menor");
    const refAvanzado = `test-ref-${randomUUID()}`;
    const refPrincipiante = `test-ref-${randomUUID()}`;

    // El perfil sube a "avanzado" primero (pago real + proyección).
    const { error: insertAvanzadoError } = await admin.from("pagos").insert({
      user_id: userId,
      proveedor: "mercadopago",
      proveedor_ref: refAvanzado,
      nivel_comprado: "avanzado",
      monto_ars: 5000,
      estado: "approved",
      payload_raw: {},
    });
    if (insertAvanzadoError) throw insertAvanzadoError;
    const nivelTrasAvanzado = await proyectarNivel(admin, userId);
    expect(nivelTrasAvanzado).toBe("avanzado");

    // Ahora llega (o se sembró para el test) un pago approved de un nivel
    // MENOR — "principiante" — para el mismo usuario, sin re-proyectar.
    const { error: insertPrincipianteError } = await admin.from("pagos").insert({
      user_id: userId,
      proveedor: "mercadopago",
      proveedor_ref: refPrincipiante,
      nivel_comprado: "principiante",
      monto_ars: 1000,
      estado: "approved",
      payload_raw: {},
    });
    if (insertPrincipianteError) throw insertPrincipianteError;

    const filaPrincipiante = await buscarFilaLedger(userId, refPrincipiante);
    // nivel_comprado (principiante) > nivel actual del perfil (avanzado) es
    // FALSO — el perfil ya está "cubierto" por el nivel superior vigente, así
    // que este pago NO debe marcarse sin_aplicar aunque nunca se haya
    // proyectado individualmente.
    expect(filaPrincipiante.sin_aplicar).toBe(false);
    expect(filaPrincipiante.user_nivel_actual).toBe("avanzado");

    // Control: el pago de avanzado sí quedó aplicado (ya se proyectó).
    const filaAvanzado = await buscarFilaLedger(userId, refAvanzado);
    expect(filaAvanzado.sin_aplicar).toBe(false);
  });
});
