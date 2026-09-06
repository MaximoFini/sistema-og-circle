// VGRP-24a — tests de integración de verdad contra el proyecto real de
// Supabase (no hay base de test separada, ver docs/TESTING.md). Cubren el
// núcleo reutilizable `pagos -> nivel` de `lib/data/pagos.ts`
// (`insertarPago`, `proyectarNivel`), que va a usar el webhook de Mercado
// Pago (VGRP-23) y, más adelante, el panel de admin.
//
// Cada test crea su propio usuario ad hoc con email @test.og-circle.invalid
// y lo limpia con cleanupUser() en un afterEach — mismo patrón que
// test/integration/schema.test.ts.

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { insertarPago, proyectarNivel } from "../../lib/data/pagos";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient } from "../helpers/db-client";
import { TEST_EMAIL_SUFFIX } from "../helpers/seed-users";
import { withAuthRetry } from "../helpers/with-auth-retry";

const admin = createTestAdminClient();

const PASSWORD = "test-password-1!";

async function crearUsuarioDeTest(prefijo: string): Promise<string> {
  const email = `${prefijo}-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }),
  );
  if (error) throw error;
  return data.user.id;
}

describe("insertarPago (VGRP-24a)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("reenviar el mismo (proveedor_ref, estado) devuelve duplicado y no crea una segunda fila", async () => {
    userId = await crearUsuarioDeTest("pagos-duplicado");
    const proveedorRef = `test-ref-${randomUUID()}`;

    const primero = await insertarPago(admin, {
      userId,
      proveedorRef,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(primero.inserted).toBe(true);

    const segundo = await insertarPago(admin, {
      userId,
      proveedorRef,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(segundo).toEqual({ inserted: false, motivo: "duplicado" });

    const { data: filas, error } = await admin
      .from("pagos")
      .select("id")
      .eq("proveedor_ref", proveedorRef)
      .eq("estado", "approved");
    expect(error).toBeNull();
    expect(filas).toHaveLength(1);
  });
});

describe("proyectarNivel (VGRP-24a)", () => {
  let userId: string | null = null;

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("un pago approved deja profiles.nivel en el nivel comprado", async () => {
    userId = await crearUsuarioDeTest("pagos-approved");

    const resultado = await insertarPago(admin, {
      userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(resultado.inserted).toBe(true);

    const nivel = await proyectarNivel(admin, userId);
    expect(nivel).toBe("avanzado");

    const { data: profile, error } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", userId)
      .single();
    expect(error).toBeNull();
    expect(profile?.nivel).toBe("avanzado");
  });

  it("gana el nivel más alto entre pagos approved, no el último cronológico (criterio central de VGRP-24)", async () => {
    userId = await crearUsuarioDeTest("pagos-precedencia");

    // Orden intencional: primero avanzado, después principiante — si
    // proyectarNivel resolviera por recencia en vez de por nivel más alto,
    // este test lo detectaría (quedaría en "principiante").
    const avanzado = await insertarPago(admin, {
      userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(avanzado.inserted).toBe(true);

    const principiante = await insertarPago(admin, {
      userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(principiante.inserted).toBe(true);

    const nivel = await proyectarNivel(admin, userId);
    expect(nivel).toBe("avanzado");
  });

  it("invocar proyectarNivel dos veces seguidas da el mismo resultado (idempotencia)", async () => {
    userId = await crearUsuarioDeTest("pagos-idempotencia");

    const resultado = await insertarPago(admin, {
      userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(resultado.inserted).toBe(true);

    const primeraCorrida = await proyectarNivel(admin, userId);
    const segundaCorrida = await proyectarNivel(admin, userId);

    expect(primeraCorrida).toBe("principiante");
    expect(segundaCorrida).toBe("principiante");

    const { data: profile, error } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", userId)
      .single();
    expect(error).toBeNull();
    expect(profile?.nivel).toBe("principiante");
  });

  it("un refunded posterior para el mismo proveedor_ref hace caer el nivel a 'ninguno'", async () => {
    userId = await crearUsuarioDeTest("pagos-refund");
    const proveedorRef = `test-ref-${randomUUID()}`;

    const aprobado = await insertarPago(admin, {
      userId,
      proveedorRef,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(aprobado.inserted).toBe(true);

    const nivelAntesDelReembolso = await proyectarNivel(admin, userId);
    expect(nivelAntesDelReembolso).toBe("avanzado");

    const reembolsado = await insertarPago(admin, {
      userId,
      proveedorRef,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "refunded",
      payloadRaw: {},
    });
    expect(reembolsado.inserted).toBe(true);

    const nivelDespuesDelReembolso = await proyectarNivel(admin, userId);
    expect(nivelDespuesDelReembolso).toBe("ninguno");

    const { data: profile, error } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", userId)
      .single();
    expect(error).toBeNull();
    expect(profile?.nivel).toBe("ninguno");
  });
});
