// VGRP-44 (sección "Esquema y triggers", cubre VGRP-15) — tests de
// integración de verdad contra el proyecto real de Supabase (no hay base de
// test separada, ver docs/TESTING.md). Usan createTestAdminClient() a
// propósito: lo que se prueba acá son garantías de esquema/trigger/constraint
// a nivel de base de datos, no política de acceso por RLS (eso vive en el
// archivo de RLS de VGRP-44, no en este).
//
// Cada test crea su propio usuario ad hoc con email @test.og-circle.invalid
// y lo limpia con cleanupUser() en un afterEach — no confiamos sólo en el
// teardown global de la suite (test/global-teardown.ts) por si el archivo se
// corta a la mitad.

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import type { NivelAcceso } from "../../lib/database.types";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient } from "../helpers/db-client";
import { TEST_EMAIL_SUFFIX } from "../helpers/seed-users";
import { withAuthRetry } from "../helpers/with-auth-retry";

const admin = createTestAdminClient();

// Password fija para todos los usuarios ad hoc de este archivo: no hace falta
// loguearse con ninguno (todo se hace con el cliente admin, que bypasea
// auth), así que la contraseña en sí es irrelevante — sólo tiene que cumplir
// el mínimo de Supabase Auth para que createUser no la rechace.
const PASSWORD = "test-password-1!";

async function crearUsuarioDeTest(prefijo: string): Promise<string> {
  const email = `${prefijo}-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }),
  );
  if (error) throw error;
  return data.user.id;
}

describe("trigger handle_new_user (VGRP-15)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("un alta en auth.users crea profiles con nivel='ninguno' y rol='user'", async () => {
    const email = `schema-trigger-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
    const { data: created, error: createError } = await withAuthRetry(() =>
      admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }),
    );
    expect(createError).toBeNull();
    if (!created.user) throw new Error("createUser no devolvió el usuario creado.");
    userId = created.user.id;

    // El trigger corre dentro de la misma transacción que el INSERT en
    // auth.users (sección 4 de la migración de esquema), así que para cuando
    // el Admin API devuelve la respuesta la fila de profiles ya existe — no
    // hace falta esperar ni reintentar.
    const { data: profile, error: profileError } = await admin
      .from("profiles")
      .select("id, email, nivel, rol")
      .eq("id", userId)
      .single();

    expect(profileError).toBeNull();
    expect(profile?.email).toBe(email);
    expect(profile?.nivel).toBe("ninguno");
    expect(profile?.rol).toBe("user");
  });
});

describe("constraint UNIQUE (proveedor_ref, estado) en pagos (VGRP-15)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("insertar dos veces el mismo (proveedor_ref, estado) viola la constraint UNIQUE (23505)", async () => {
    userId = await crearUsuarioDeTest("schema-pagos-unique");

    const proveedorRef = `test-ref-${randomUUID()}`;
    const pagoBase = {
      user_id: userId,
      proveedor: "mercadopago",
      proveedor_ref: proveedorRef,
      nivel_comprado: "principiante" as const,
      monto_ars: 1000,
      estado: "approved",
      payload_raw: {},
    };

    const primero = await admin.from("pagos").insert(pagoBase);
    expect(primero.error).toBeNull();

    // Mismo (proveedor_ref, estado): simula el webhook de MercadoPago
    // reenviando el mismo evento — tiene que chocar contra la constraint
    // pagos_proveedor_ref_estado_key, no insertar una segunda fila.
    const segundo = await admin.from("pagos").insert(pagoBase);
    expect(segundo.error).not.toBeNull();
    expect(segundo.error?.code).toBe("23505");
  });

  it("el mismo proveedor_ref con OTRO estado sí se puede insertar (no es UNIQUE(proveedor_ref) solo)", async () => {
    userId = await crearUsuarioDeTest("schema-pagos-transicion");

    const proveedorRef = `test-ref-${randomUUID()}`;
    const base = {
      user_id: userId,
      proveedor: "mercadopago",
      proveedor_ref: proveedorRef,
      nivel_comprado: "principiante" as const,
      monto_ars: 1000,
      payload_raw: {},
    };

    // Dos transiciones de estado del mismo pago (pending -> approved): el
    // ledger append-only necesita que esto conviva sin chocar, es justo lo
    // que la constraint compuesta (proveedor_ref, estado) permite y
    // UNIQUE(proveedor_ref) a secas no permitiría (ver comentario en la
    // migración de esquema).
    const pending = await admin.from("pagos").insert({ ...base, estado: "pending" });
    expect(pending.error).toBeNull();

    const approved = await admin.from("pagos").insert({ ...base, estado: "approved" });
    expect(approved.error).toBeNull();
  });
});

describe("los enums rechazan valores fuera de su dominio (VGRP-15)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("update de profiles.nivel a un valor fuera del enum nivel_acceso falla", async () => {
    userId = await crearUsuarioDeTest("schema-enum-profiles");

    // El cast "as unknown as NivelAcceso" es a propósito: TypeScript ya
    // bloquearía este valor en tiempo de compilación (el generador tipa
    // `nivel` como el union del enum), pero acá lo que se prueba es la
    // protección de la BASE, no la de TypeScript — hay que forzar el escape
    // del tipo para poder mandar el string inválido de verdad.
    const { error } = await admin
      .from("profiles")
      .update({ nivel: "premium-vitalicio" as unknown as NivelAcceso })
      .eq("id", userId);

    expect(error).not.toBeNull();
  });

  it("update de pagos.nivel_comprado a un valor fuera del enum nivel_acceso falla", async () => {
    userId = await crearUsuarioDeTest("schema-enum-pagos");

    const { data: pago, error: insertError } = await admin
      .from("pagos")
      .insert({
        user_id: userId,
        proveedor: "mercadopago",
        proveedor_ref: `test-ref-${randomUUID()}`,
        nivel_comprado: "principiante",
        monto_ars: 1000,
        estado: "approved",
        payload_raw: {},
      })
      .select("id")
      .single();
    expect(insertError).toBeNull();
    if (!pago) throw new Error("insert de pagos no devolvió la fila creada");

    const { error } = await admin
      .from("pagos")
      .update({ nivel_comprado: "premium-vitalicio" as unknown as NivelAcceso })
      .eq("id", pago.id);

    expect(error).not.toBeNull();
  });
});
