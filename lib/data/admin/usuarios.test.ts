// VGRP-36 — tests de integración de `lib/data/admin/usuarios.ts` contra el
// proyecto real de Supabase (no hay base separada, ver docs/TESTING.md).
//
// Cada test crea sus propios usuarios ad hoc (@test.og-circle.invalid) y los
// limpia con `cleanupUser()` — que ya aprende `nivel_overrides` en esta misma
// PR (test/helpers/cleanup.ts).

import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createAuthenticatedUser } from "../../../test/helpers/auth";
import { cleanupUser } from "../../../test/helpers/cleanup";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import { SEED_ADMIN_USER } from "../../../test/helpers/seed-users";
import { withAuthRetry } from "../../../test/helpers/with-auth-retry";
import { insertarPago, proyectarNivel } from "../pagos";
import { activarNivel, listarUsuarios, obtenerUsuario, UsuarioNoEncontrado } from "./usuarios";

const admin = createTestAdminClient();

let actorId = "";
const creados: string[] = [];

async function nuevoUsuario(nivel: "ninguno" | "principiante" | "avanzado" = "ninguno") {
  const u = await createAuthenticatedUser(nivel);
  creados.push(u.userId);
  return u;
}

async function nivelEnMetadata(userId: string): Promise<unknown> {
  const { data } = await withAuthRetry(() => admin.auth.admin.getUserById(userId));
  return data.user?.app_metadata?.nivel;
}

beforeAll(async () => {
  const { data, error } = await admin
    .from("profiles")
    .select("id")
    .eq("email", SEED_ADMIN_USER.email)
    .single();
  if (error || !data) {
    throw new Error(
      `No se encontró el usuario admin del seed (${SEED_ADMIN_USER.email}). ` +
        "¿Corriste `pnpm db:seed:test`?",
    );
  }
  actorId = data.id;
});

afterEach(async () => {
  while (creados.length > 0) {
    const id = creados.pop();
    if (id) await cleanupUser(id);
  }
});

describe("listarUsuarios", () => {
  it("busca por email parcial en la base y sólo devuelve los que matchean", async () => {
    const a = await nuevoUsuario("ninguno");
    await nuevoUsuario("ninguno");
    // `a.email` es `helper-<uuid>@test.og-circle.invalid`: un fragmento del
    // uuid es único entre los dos usuarios recién creados.
    const fragmento = a.email.slice(12, 24);

    const { usuarios } = await listarUsuarios(admin, { q: fragmento, limit: 50 });
    expect(usuarios).toHaveLength(1);
    expect(usuarios[0].id).toBe(a.userId);
  });

  it("filtra por nivel", async () => {
    const av = await nuevoUsuario("avanzado");
    await nuevoUsuario("ninguno");

    const { usuarios } = await listarUsuarios(admin, { nivel: "avanzado", limit: 100 });
    expect(usuarios.some((u) => u.id === av.userId)).toBe(true);
    expect(usuarios.every((u) => u.nivel === "avanzado")).toBe(true);
  });

  it("keyset: dos páginas disjuntas", async () => {
    await nuevoUsuario("ninguno");
    await nuevoUsuario("ninguno");
    await nuevoUsuario("ninguno");

    const p1 = await listarUsuarios(admin, { limit: 2 });
    expect(p1.usuarios).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await listarUsuarios(admin, { limit: 2, cursor: p1.nextCursor ?? undefined });
    const ids1 = new Set(p1.usuarios.map((u) => u.id));
    for (const u of p2.usuarios) expect(ids1.has(u.id)).toBe(false);
  });
});

describe("obtenerUsuario", () => {
  it("devuelve perfil + nivel activo + pagos + overrides", async () => {
    const u = await nuevoUsuario("ninguno");
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });

    const detalle = await obtenerUsuario(admin, u.userId);
    expect(detalle).not.toBeNull();
    expect(detalle?.perfil.id).toBe(u.userId);
    expect(detalle?.pagos).toHaveLength(1);
    expect(detalle?.nivelActivo).toBe("principiante");
    expect(Array.isArray(detalle?.overrides)).toBe(true);
    expect(detalle?.perfil.progreso).toBeDefined();
  });

  it("id inexistente -> null", async () => {
    expect(await obtenerUsuario(admin, randomUUID())).toBeNull();
  });
});

describe("activarNivel", () => {
  it("fija profiles.nivel y app_metadata y devuelve nivelAnterior/nivelNuevo (sin ningún pago)", async () => {
    const u = await nuevoUsuario("ninguno");

    const out = await activarNivel(admin, {
      userId: u.userId,
      nivel: "avanzado",
      motivo: "activación manual de prueba",
      actorId,
    });

    expect(out.resultado).toEqual({ nivelAnterior: "ninguno", nivelNuevo: "avanzado" });
    expect(out.valorAnterior).toEqual({ nivel: "ninguno" });
    expect(out.valorNuevo).toEqual({ nivel: "avanzado", motivo: "activación manual de prueba" });

    const { data: perfil } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", u.userId)
      .single();
    expect(perfil?.nivel).toBe("avanzado");
    expect(await nivelEnMetadata(u.userId)).toBe("avanzado");
  });

  it("es idempotente: mismo nivel dos veces, sin error, anterior == nuevo la segunda vez", async () => {
    const u = await nuevoUsuario("ninguno");
    await activarNivel(admin, { userId: u.userId, nivel: "principiante", motivo: "m1", actorId });
    const out = await activarNivel(admin, {
      userId: u.userId,
      nivel: "principiante",
      motivo: "m2",
      actorId,
    });
    expect(out.resultado).toEqual({ nivelAnterior: "principiante", nivelNuevo: "principiante" });
  });

  it("baja a 'ninguno'", async () => {
    const u = await nuevoUsuario("avanzado");
    const out = await activarNivel(admin, {
      userId: u.userId,
      nivel: "ninguno",
      motivo: "revocar",
      actorId,
    });
    expect(out.resultado.nivelNuevo).toBe("ninguno");
    const { data: perfil } = await admin
      .from("profiles")
      .select("nivel")
      .eq("id", u.userId)
      .single();
    expect(perfil?.nivel).toBe("ninguno");
  });

  it("baja a 'principiante' con un pago approved de 'avanzado': el override (más nuevo) gana", async () => {
    const u = await nuevoUsuario("ninguno");
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });

    const out = await activarNivel(admin, {
      userId: u.userId,
      nivel: "principiante",
      motivo: "ajuste",
      actorId,
    });
    expect(out.resultado.nivelNuevo).toBe("principiante");
  });

  it("opción B: el override gana contra el pago de MAYOR nivel viejo, aunque haya un pago de menor nivel posterior", async () => {
    const u = await nuevoUsuario("ninguno");

    // Pago approved de 'avanzado' con created_at antiguo (una semana atrás).
    const refAvanzado = `test-ref-${randomUUID()}`;
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: refAvanzado,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    const viejo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString();
    const { error: backdateError } = await admin
      .from("pagos")
      .update({ created_at: viejo })
      .eq("proveedor_ref", refAvanzado)
      .eq("estado", "approved");
    expect(backdateError).toBeNull();

    // Override manual a 'principiante' — created_at = ahora, POSTERIOR al pago avanzado.
    const out = await activarNivel(admin, {
      userId: u.userId,
      nivel: "principiante",
      motivo: "opción B",
      actorId,
    });
    expect(out.resultado.nivelNuevo).toBe("principiante");

    // Segundo pago approved de 'principiante', insertado DESPUÉS del override.
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });

    // nivel_vigente() v3 (opción B): el override se compara contra el pago de
    // MAYOR nivel (el 'avanzado' viejo), no contra max(created_at) global. El
    // override es posterior a ese pago -> sigue ganando -> 'principiante'.
    // Con la v3 previa este caso daba 'avanzado'.
    const detalle = await obtenerUsuario(admin, u.userId);
    expect(detalle?.nivelActivo).toBe("principiante");
  });

  it("un pago approved de MP posterior al override lo supera", async () => {
    const u = await nuevoUsuario("ninguno");
    await activarNivel(admin, {
      userId: u.userId,
      nivel: "principiante",
      motivo: "temporal",
      actorId,
    });

    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    const nivel = await proyectarNivel(admin, u.userId);
    expect(nivel).toBe("avanzado");
  });

  it("usuario inexistente -> lanza UsuarioNoEncontrado", async () => {
    await expect(
      activarNivel(admin, { userId: randomUUID(), nivel: "avanzado", motivo: "x", actorId }),
    ).rejects.toBeInstanceOf(UsuarioNoEncontrado);
  });
});
