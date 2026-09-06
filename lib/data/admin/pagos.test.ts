// VGRP-37 — tests de `lib/data/admin/pagos.ts`.
//
// - `sanitizarPayloadRaw`: unit puro (sin I/O).
// - `listarPagos` / `obtenerPago` / `reprocesarPago`: integración contra el
//   proyecto real de Supabase (no hay base separada, ver docs/TESTING.md).
//
// Cada test de integración crea sus propios usuarios ad hoc
// (@test.og-circle.invalid) y los limpia con `cleanupUser()`. Para sembrar el
// caso "sin aplicar" se hace `insert` directo en `pagos` (vía `insertarPago`)
// SIN llamar a `proyectarNivel`, así el `profiles.nivel` queda desactualizado a
// propósito.

import { randomUUID } from "node:crypto";
import { afterEach, beforeAll, describe, expect, it } from "vitest";
import { cleanupUser } from "../../../test/helpers/cleanup";
import { applyNivelRol, createTestAdminClient } from "../../../test/helpers/db-client";
import { SEED_ADMIN_USER, TEST_EMAIL_SUFFIX } from "../../../test/helpers/seed-users";
import { withAuthRetry } from "../../../test/helpers/with-auth-retry";
import { insertarPago, proyectarNivel } from "../pagos";
import {
  contarPagosSinAplicar,
  listarPagos,
  obtenerPago,
  PagoNoEncontrado,
  PagoNoReprocesable,
  reprocesarPago,
  sanitizarPayloadRaw,
} from "./pagos";

const admin = createTestAdminClient();

let actorId = "";
const creados: string[] = [];

// Crea un usuario de test SIN loguearlo (no necesitamos access token acá) —
// una llamada de auth menos por usuario que `createAuthenticatedUser`, para no
// castigar el rate limit de Supabase Auth cuando este archivo corre dentro de
// la suite completa. Mismo patrón que `test/integration/pagos.test.ts`.
async function nuevoUsuario(nivel: "ninguno" | "principiante" | "avanzado" = "ninguno") {
  const email = `pagos-adm-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: "test-password-1!", email_confirm: true }),
  );
  if (error) throw error;
  const userId = data.user.id;
  if (nivel !== "ninguno") await applyNivelRol(admin, userId, nivel, "user");
  creados.push(userId);
  return { userId, email };
}

async function contarPagosDe(userId: string): Promise<number> {
  const { count, error } = await admin
    .from("pagos")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId);
  if (error) throw error;
  return count ?? 0;
}

async function nivelDe(userId: string): Promise<string | undefined> {
  const { data } = await admin.from("profiles").select("nivel").eq("id", userId).single();
  return data?.nivel;
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

// ---------------------------------------------------------------------------
// sanitizarPayloadRaw (unit puro)
// ---------------------------------------------------------------------------

describe("sanitizarPayloadRaw", () => {
  const RAW = {
    id: 123,
    status: "approved",
    status_detail: "accredited",
    transaction_amount: 75000,
    currency_id: "ARS",
    metadata: { nivel: "avanzado", internal_token: "abc123" },
    // fuera de la allowlist:
    card: { last_four_digits: "4242", cardholder: { name: "Test" } },
    token: "tok_live_secret",
    api_key: "APP_USR-xxx",
    payer: {
      email: "buyer@example.com",
      identification: { type: "DNI", number: "12345678" },
      phone: { number: "1122334455" },
      first_name: "Test",
    },
  };

  it("conserva sólo los campos de la allowlist", () => {
    const out = sanitizarPayloadRaw(RAW) as Record<string, unknown>;
    expect(out.id).toBe(123);
    expect(out.status).toBe("approved");
    expect(out.status_detail).toBe("accredited");
    expect(out.transaction_amount).toBe(75000);
    expect(out.currency_id).toBe("ARS");
  });

  it("descarta claves desconocidas y datos sensibles (card, token, api_key)", () => {
    const out = sanitizarPayloadRaw(RAW) as Record<string, unknown>;
    expect(out.card).toBeUndefined();
    expect(out.token).toBeUndefined();
    expect(out.api_key).toBeUndefined();
  });

  it("filtra `payer` al subconjunto email + identification", () => {
    const out = sanitizarPayloadRaw(RAW) as { payer: Record<string, unknown> };
    expect(out.payer).toEqual({
      email: "buyer@example.com",
      identification: { type: "DNI", number: "12345678" },
    });
  });

  it("redacta claves sensibles anidadas dentro de un campo permitido (metadata)", () => {
    const out = sanitizarPayloadRaw(RAW) as { metadata: Record<string, unknown> };
    expect(out.metadata.nivel).toBe("avanzado");
    expect(out.metadata.internal_token).toBe("[redactado]");
  });

  it("devuelve {} si el payload no es un objeto plano", () => {
    expect(sanitizarPayloadRaw(null)).toEqual({});
    expect(sanitizarPayloadRaw("string")).toEqual({});
    expect(sanitizarPayloadRaw([1, 2, 3])).toEqual({});
  });
});

// ---------------------------------------------------------------------------
// listarPagos
// ---------------------------------------------------------------------------

describe("listarPagos", () => {
  it("filtra por estado, por rango de fechas y por proveedor_ref; pagina por keyset", async () => {
    const u = await nuevoUsuario("ninguno");
    const token = randomUUID().slice(0, 12);

    for (let i = 0; i < 3; i++) {
      await insertarPago(admin, {
        userId: u.userId,
        proveedorRef: `${token}-approved-${i}`,
        nivelComprado: "principiante",
        montoArs: 1000,
        estado: "approved",
        payloadRaw: {},
      });
    }
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `${token}-rejected-0`,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "rejected",
      payloadRaw: {},
    });

    // proveedor_ref (parcial) + estado
    const soloApproved = await listarPagos(admin, {
      proveedorRef: token,
      estado: "approved",
      limit: 100,
    });
    expect(soloApproved.pagos).toHaveLength(3);
    expect(soloApproved.pagos.every((p) => p.estado === "approved")).toBe(true);

    // rango de fechas: futuro -> nada
    const futuro = await listarPagos(admin, {
      proveedorRef: token,
      desde: new Date(Date.now() + 86_400_000).toISOString(),
      limit: 100,
    });
    expect(futuro.pagos).toHaveLength(0);

    // keyset: 2 páginas disjuntas
    const p1 = await listarPagos(admin, { proveedorRef: token, estado: "approved", limit: 2 });
    expect(p1.pagos).toHaveLength(2);
    expect(p1.nextCursor).not.toBeNull();
    const p2 = await listarPagos(admin, {
      proveedorRef: token,
      estado: "approved",
      limit: 2,
      cursor: p1.nextCursor ?? undefined,
    });
    const ids1 = new Set(p1.pagos.map((p) => p.id));
    for (const p of p2.pagos) expect(ids1.has(p.id)).toBe(false);
  });

  it("marca sin_aplicar en un approved cuyo nivel_comprado supera el nivel del perfil", async () => {
    const u = await nuevoUsuario("ninguno");
    const ref = `test-ref-${randomUUID()}`;
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: ref,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });

    const { pagos } = await listarPagos(admin, { proveedorRef: ref, limit: 10 });
    expect(pagos).toHaveLength(1);
    expect(pagos[0].sin_aplicar).toBe(true);
  });

  it("NO marca sin_aplicar cuando el perfil ya está en un nivel >= (Principiante después Avanzado)", async () => {
    const u = await nuevoUsuario("ninguno");
    const tokenPrefix = `test-ref-${randomUUID()}`;

    // El usuario compró Principiante y después Avanzado; ambos pagos aplicados.
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `${tokenPrefix}-princ`,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `${tokenPrefix}-avanz`,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    await proyectarNivel(admin, u.userId); // profiles.nivel -> avanzado

    const { pagos } = await listarPagos(admin, { proveedorRef: tokenPrefix, limit: 10 });
    const princ = pagos.find((p) => p.proveedor_ref.endsWith("-princ"));
    const avanz = pagos.find((p) => p.proveedor_ref.endsWith("-avanz"));
    expect(princ?.sin_aplicar).toBe(false); // principiante > avanzado es falso
    expect(avanz?.sin_aplicar).toBe(false); // ya aplicado
  });

  it("NO marca sin_aplicar para un approved con refunded del mismo proveedor_ref", async () => {
    const u = await nuevoUsuario("ninguno");
    const ref = `test-ref-${randomUUID()}`;
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: ref,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: ref,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "refunded",
      payloadRaw: {},
    });

    const { pagos } = await listarPagos(admin, {
      proveedorRef: ref,
      estado: "approved",
      limit: 10,
    });
    expect(pagos).toHaveLength(1);
    expect(pagos[0].sin_aplicar).toBe(false);
  });

  it("NO marca sin_aplicar cuando un nivel_overrides POSTERIOR al pago lo tapa (baja manual del admin)", async () => {
    // Usuario con pago approved de `avanzado` sin proyectar -> profiles.nivel
    // sigue en `ninguno`, así que sin este cambio la fila daría sin_aplicar=true.
    const u = await nuevoUsuario("ninguno");
    const ref = `test-ref-${randomUUID()}`;
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: ref,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });

    const antesOverride = await listarPagos(admin, { proveedorRef: ref, limit: 10 });
    expect(antesOverride.pagos[0].sin_aplicar).toBe(true);
    const totalConFalsoPositivo = await contarPagosSinAplicar(admin);

    // El admin baja el nivel a mano DESPUÉS del pago (override.created_at >= pago).
    const { error } = await admin.from("nivel_overrides").insert({
      user_id: u.userId,
      nivel: "principiante",
      motivo: "baja manual",
      actor_id: actorId,
    });
    if (error) throw error;

    const { pagos } = await listarPagos(admin, { proveedorRef: ref, limit: 10 });
    expect(pagos).toHaveLength(1);
    expect(pagos[0].sin_aplicar).toBe(false); // el override posterior lo tapa
    // <= por si otro archivo de test (corren en paralelo) mueve el conteo global
    // en la ventana entre las dos lecturas; lo que importa es que ESTE pago dejó
    // de contar, ya verificado con `sin_aplicar === false` arriba.
    expect(await contarPagosSinAplicar(admin)).toBeLessThanOrEqual(totalConFalsoPositivo - 1);
  });

  it("SÍ marca sin_aplicar cuando el pago es POSTERIOR al override (override viejo no lo tapa)", async () => {
    const u = await nuevoUsuario("ninguno");

    // Override viejo primero...
    const { error } = await admin.from("nivel_overrides").insert({
      user_id: u.userId,
      nivel: "principiante",
      motivo: "activacion vieja",
      actor_id: actorId,
    });
    if (error) throw error;

    // ...y después un pago approved de nivel más alto, sin proyectar (webhook falló).
    const ref = `test-ref-${randomUUID()}`;
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: ref,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });

    const { pagos } = await listarPagos(admin, { proveedorRef: ref, limit: 10 });
    expect(pagos).toHaveLength(1);
    expect(pagos[0].sin_aplicar).toBe(true); // override más viejo que el pago: no lo tapa
  });

  it("totalSinAplicar sube al sembrar un pago sin aplicar", async () => {
    const antes = await contarPagosSinAplicar(admin);
    const u = await nuevoUsuario("ninguno");
    await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    const { totalSinAplicar } = await listarPagos(admin, { limit: 1 });
    expect(totalSinAplicar).toBeGreaterThanOrEqual(antes + 1);
  });
});

// ---------------------------------------------------------------------------
// obtenerPago
// ---------------------------------------------------------------------------

describe("obtenerPago", () => {
  it("devuelve el pago + payload sanitizado + sinAplicar + email; id inexistente -> null", async () => {
    const u = await nuevoUsuario("ninguno");
    const ref = `test-ref-${randomUUID()}`;
    const ins = await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: ref,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: { id: 1, status: "approved", token: "secreto" },
    });
    if (!ins.inserted) throw new Error("no se insertó el pago de prueba");

    const detalle = await obtenerPago(admin, ins.pago.id);
    expect(detalle?.pago.id).toBe(ins.pago.id);
    expect(detalle).not.toBeNull();
    expect(detalle?.userEmail).toBe(u.email);
    expect(detalle?.sinAplicar).toBe(true);
    const payload = (detalle?.payloadRawSanitizado ?? {}) as Record<string, unknown>;
    expect(payload.token).toBeUndefined();
    expect(payload.status).toBe("approved");

    expect(await obtenerPago(admin, randomUUID())).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// reprocesarPago
// ---------------------------------------------------------------------------

describe("reprocesarPago", () => {
  it("un approved sin aplicar: re-proyecta, profiles.nivel sube, cero filas nuevas en pagos", async () => {
    const u = await nuevoUsuario("ninguno");
    const ins = await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "avanzado",
      montoArs: 5000,
      estado: "approved",
      payloadRaw: {},
    });
    if (!ins.inserted) throw new Error("no se insertó el pago de prueba");
    expect(await nivelDe(u.userId)).toBe("ninguno");

    const pagosAntes = await contarPagosDe(u.userId);
    const out = await reprocesarPago(admin, { pagoId: ins.pago.id, actorId });

    expect(out.resultado).toEqual({ nivelAnterior: "ninguno", nivelNuevo: "avanzado" });
    expect(out.valorAnterior).toEqual({ nivel: "ninguno" });
    expect(out.valorNuevo).toEqual({ nivel: "avanzado" });
    expect(await nivelDe(u.userId)).toBe("avanzado");
    expect(await contarPagosDe(u.userId)).toBe(pagosAntes);
  });

  it("un pago ya aplicado: idempotente, nivel no cambia, sin error", async () => {
    const u = await nuevoUsuario("ninguno");
    const ins = await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "approved",
      payloadRaw: {},
    });
    if (!ins.inserted) throw new Error("no se insertó el pago de prueba");
    await proyectarNivel(admin, u.userId);

    const out = await reprocesarPago(admin, { pagoId: ins.pago.id, actorId });
    expect(out.resultado).toEqual({ nivelAnterior: "principiante", nivelNuevo: "principiante" });
  });

  it("estado != 'approved' -> lanza PagoNoReprocesable", async () => {
    const u = await nuevoUsuario("ninguno");
    const ins = await insertarPago(admin, {
      userId: u.userId,
      proveedorRef: `test-ref-${randomUUID()}`,
      nivelComprado: "principiante",
      montoArs: 1000,
      estado: "rejected",
      payloadRaw: {},
    });
    if (!ins.inserted) throw new Error("no se insertó el pago de prueba");

    await expect(reprocesarPago(admin, { pagoId: ins.pago.id, actorId })).rejects.toBeInstanceOf(
      PagoNoReprocesable,
    );
  });

  it("id inexistente -> lanza PagoNoEncontrado", async () => {
    await expect(reprocesarPago(admin, { pagoId: randomUUID(), actorId })).rejects.toBeInstanceOf(
      PagoNoEncontrado,
    );
  });
});
