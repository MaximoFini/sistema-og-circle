// VGRP-35 — tests de integración de `lib/data/admin/audit-log.ts` contra el
// proyecto real de Supabase (no hay base separada, ver docs/TESTING.md).
//
// Usa el usuario admin del seed (`SEED_ADMIN_USER`) como `actor_id` — su fila
// de `profiles` ya existe. Cada test limpia las filas que insertó.

import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import { SEED_ADMIN_USER } from "../../../test/helpers/seed-users";
import { conAuditoria, listarAuditLog, registrarAccionAdmin } from "./audit-log";

const admin = createTestAdminClient();

let actorId = "";

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
  // Barrido por actor: alcanza porque todo lo que estos tests insertan usa
  // `actorId`. `entidad_id` marcado con un prefijo reconocible por las dudas.
  await admin.from("admin_audit_log").delete().eq("actor_id", actorId);
});

describe("registrarAccionAdmin", () => {
  it("inserta una fila con todos los campos y tipos correctos", async () => {
    await registrarAccionAdmin(admin, {
      actorId,
      accion: "cambiar_nivel",
      entidad: "profiles",
      entidadId: actorId,
      valorAnterior: { nivel: "ninguno" },
      valorNuevo: { nivel: "avanzado", motivo: "test" },
    });

    const { data, error } = await admin.from("admin_audit_log").select().eq("actor_id", actorId);

    expect(error).toBeNull();
    expect(data).toHaveLength(1);
    const fila = data?.[0];
    expect(fila?.accion).toBe("cambiar_nivel");
    expect(fila?.entidad).toBe("profiles");
    expect(fila?.entidad_id).toBe(actorId);
    expect(fila?.valor_anterior).toEqual({ nivel: "ninguno" });
    expect(fila?.valor_nuevo).toEqual({ nivel: "avanzado", motivo: "test" });
    expect(typeof fila?.created_at).toBe("string");
  });
});

describe("conAuditoria", () => {
  it("con mutacion OK: escribe la fila y devuelve el resultado", async () => {
    const out = await conAuditoria(
      admin,
      { actorId, accion: "reprocesar_pago", entidad: "pagos", entidadId: "pago-xyz" },
      async () => ({
        resultado: { nivelAnterior: "ninguno", nivelNuevo: "principiante" },
        valorAnterior: { nivel: "ninguno" },
        valorNuevo: { nivel: "principiante" },
      }),
    );

    expect(out).toEqual({ nivelAnterior: "ninguno", nivelNuevo: "principiante" });

    const { data } = await admin.from("admin_audit_log").select().eq("actor_id", actorId);
    expect(data).toHaveLength(1);
    expect(data?.[0]?.accion).toBe("reprocesar_pago");
    expect(data?.[0]?.entidad_id).toBe("pago-xyz");
  });

  it("con mutacion que lanza: NO escribe fila y propaga el error", async () => {
    const boom = new Error("la mutación falló");

    await expect(
      conAuditoria(
        admin,
        { actorId, accion: "cambiar_nivel", entidad: "profiles", entidadId: actorId },
        async () => {
          throw boom;
        },
      ),
    ).rejects.toBe(boom);

    const { data } = await admin.from("admin_audit_log").select().eq("actor_id", actorId);
    expect(data).toHaveLength(0);
  });
});

describe("listarAuditLog", () => {
  async function sembrar(n: number) {
    for (let i = 0; i < n; i++) {
      await registrarAccionAdmin(admin, {
        actorId,
        accion: "cambiar_nivel",
        entidad: "profiles",
        entidadId: `seed-${i}`,
        valorAnterior: { nivel: "ninguno" },
        valorNuevo: { nivel: "principiante" },
      });
    }
  }

  it("filtra por actorId y ordena de más reciente a más antiguo", async () => {
    await sembrar(3);

    const { filas } = await listarAuditLog(admin, { actorId, limit: 20 });

    expect(filas.length).toBe(3);
    expect(filas.every((f) => f.actorId === actorId)).toBe(true);
    // created_at desc
    for (let i = 1; i < filas.length; i++) {
      expect(filas[i - 1].createdAt >= filas[i].createdAt).toBe(true);
    }
    // otro actor no aparece
    const { filas: otras } = await listarAuditLog(admin, {
      actorId: "00000000-0000-0000-0000-000000000000",
      limit: 20,
    });
    expect(otras).toHaveLength(0);
  });

  it("filtra por rango de fechas", async () => {
    await sembrar(2);
    const futuro = new Date(Date.now() + 60_000).toISOString();

    const { filas } = await listarAuditLog(admin, { actorId, desde: futuro, limit: 20 });
    expect(filas).toHaveLength(0);

    const pasado = new Date(Date.now() - 60_000).toISOString();
    const { filas: todas } = await listarAuditLog(admin, { actorId, desde: pasado, limit: 20 });
    expect(todas.length).toBe(2);
  });

  it("keyset: dos páginas disjuntas, no trae todo de una", async () => {
    await sembrar(5);

    const p1 = await listarAuditLog(admin, { actorId, limit: 2 });
    expect(p1.filas).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();

    const p2 = await listarAuditLog(admin, {
      actorId,
      limit: 2,
      cursor: p1.nextCursor ?? undefined,
    });
    expect(p2.filas).toHaveLength(2);

    const ids1 = new Set(p1.filas.map((f) => f.id));
    const ids2 = p2.filas.map((f) => f.id);
    for (const id of ids2) expect(ids1.has(id)).toBe(false);

    // p2 arranca después de p1 en el orden desc
    const ultimaP1 = p1.filas.at(-1);
    expect(ultimaP1 && ultimaP1.createdAt >= p2.filas[0].createdAt).toBe(true);
  });

  it("cursor malformado: se ignora, arranca desde el principio (no 500)", async () => {
    await sembrar(2);

    const { filas } = await listarAuditLog(admin, {
      actorId,
      limit: 20,
      cursor: "no-es-base64-valido-!!!",
    });
    expect(filas.length).toBe(2);
  });

  it("cursor con estructura válida pero valores fuera de forma (intento de inyección PostgREST): se ignora", async () => {
    await sembrar(2);

    const cursorMalicioso = Buffer.from(
      JSON.stringify({ createdAt: "2020-01-01,or,id.gt.0", id: "1;drop" }),
      "utf8",
    ).toString("base64url");

    const { filas } = await listarAuditLog(admin, {
      actorId,
      limit: 20,
      cursor: cursorMalicioso,
    });
    // Se ignora el cursor -> devuelve desde el principio, sin error.
    expect(filas.length).toBe(2);
  });
});
