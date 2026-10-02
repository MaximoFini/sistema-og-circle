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
import { applyNivelRol, createTestAdminClient } from "../helpers/db-client";
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
      nivelComprado: "completo",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(primero.inserted).toBe(true);

    const segundo = await insertarPago(admin, {
      userId,
      proveedorRef,
      nivelComprado: "completo",
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
      nivelComprado: "completo",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(resultado.inserted).toBe(true);

    const nivel = await proyectarNivel(admin, userId);
    expect(nivel).toBe("completo");

    const { data: profile, error } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", userId)
      .single();
    expect(error).toBeNull();
    expect(profile?.nivel).toBe("completo");
  });

  // VGRP-59/60 (Bloque 13 — plan único): con un solo nivel pago ya no hay
  // "el más alto entre dos niveles distintos" que comparar — este test ahora
  // confirma que DOS pagos approved del mismo (único) nivel, en cualquier
  // orden, siguen proyectando 'completo' de forma estable (no "el último
  // cronológico" ni ningún otro criterio raro).
  it("dos pagos approved consecutivos dejan al usuario en 'completo' (criterio central de VGRP-24, adaptado a plan único)", async () => {
    userId = await crearUsuarioDeTest("pagos-precedencia");

    const primero = await insertarPago(admin, {
      userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "completo",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(primero.inserted).toBe(true);

    const segundo = await insertarPago(admin, {
      userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "completo",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(segundo.inserted).toBe(true);

    const nivel = await proyectarNivel(admin, userId);
    expect(nivel).toBe("completo");
  });

  it("invocar proyectarNivel dos veces seguidas da el mismo resultado (idempotencia)", async () => {
    userId = await crearUsuarioDeTest("pagos-idempotencia");

    const resultado = await insertarPago(admin, {
      userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "completo",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(resultado.inserted).toBe(true);

    const primeraCorrida = await proyectarNivel(admin, userId);
    const segundaCorrida = await proyectarNivel(admin, userId);

    expect(primeraCorrida).toBe("completo");
    expect(segundaCorrida).toBe("completo");

    const { data: profile, error } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", userId)
      .single();
    expect(error).toBeNull();
    expect(profile?.nivel).toBe("completo");
  });

  it("un refunded posterior para el mismo proveedor_ref hace caer el nivel a 'ninguno'", async () => {
    userId = await crearUsuarioDeTest("pagos-refund");
    const proveedorRef = `test-ref-${randomUUID()}`;

    const aprobado = await insertarPago(admin, {
      userId,
      proveedorRef,
      nivelComprado: "completo",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(aprobado.inserted).toBe(true);

    const nivelAntesDelReembolso = await proyectarNivel(admin, userId);
    expect(nivelAntesDelReembolso).toBe("completo");

    const reembolsado = await insertarPago(admin, {
      userId,
      proveedorRef,
      nivelComprado: "completo",
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

  // VGRP-46 §3 — invariante documentado en el código de `proyectarNivel`
  // (lib/data/pagos.ts) y sin test hasta ahora: si se rompe, un admin pierde
  // el panel en silencio la próxima vez que se le proyecte un pago (por
  // ejemplo, si compra un nivel él mismo, o si se le reprocesa un pago desde
  // el propio panel de admin).
  it("proyectarNivel no pisa el rol de un usuario admin", async () => {
    const uid = await crearUsuarioDeTest("pagos-preserva-rol");
    userId = uid;
    await applyNivelRol(admin, uid, "ninguno", "admin");

    const resultado = await insertarPago(admin, {
      userId: uid,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "completo",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    expect(resultado.inserted).toBe(true);

    const nivel = await proyectarNivel(admin, uid);
    expect(nivel).toBe("completo");

    const { data: profile, error } = await admin
      .from("profiles")
      .select("nivel, rol")
      .eq("id", uid)
      .single();
    expect(error).toBeNull();
    expect(profile?.nivel).toBe("completo");
    expect(profile?.rol).toBe("admin");

    const { data: authUser, error: authError } = await withAuthRetry(() =>
      admin.auth.admin.getUserById(uid),
    );
    expect(authError).toBeNull();
    expect((authUser?.user?.app_metadata as Record<string, unknown> | undefined)?.rol).toBe(
      "admin",
    );
  });
});
