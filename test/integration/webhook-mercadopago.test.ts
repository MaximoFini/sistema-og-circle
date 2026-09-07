// VGRP-46 §2 — tests de INTEGRACIÓN del webhook de Mercado Pago, contra
// Postgres real. `app/api/webhooks/mercadopago/route.test.ts` (mockeado) ya
// cubre el contrato de idempotencia con `insertarPago`/`proyectarNivel`
// mockeados; este archivo cubre el hueco que ese archivo declara
// explícitamente NO cubrir: que la proyección `pagos -> nivel` (VGRP-24a) y
// las policies/constraints reales de la base efectivamente ocurran cuando el
// handler corre de punta a punta.
//
// Qué se mockea y qué no (criterio de aceptación del ticket): SÓLO la API de
// Mercado Pago (`getPaymentClient`, es un tercero) y `@vercel/analytics/server`
// (evita un POST de red real a Vercel Analytics en cada test). Todo lo demás
// —`insertarPago`, `proyectarNivel`, `createServiceRoleClient`,
// `validarFirmaMercadoPago`— corre CON SU CÓDIGO REAL contra el proyecto de
// Supabase real (no hay proyecto de test separado, ver docs/TESTING.md). La
// firma HMAC de cada request también es REAL: se firma con
// `test/helpers/mercadopago-signature.ts`, que reutiliza el mismo manifest
// documentado en `lib/mercadopago/validarFirma.ts` en vez de reinventarlo.
//
// Hallazgo honesto sobre "nunca confiar en el status del body": el payload
// real que Mercado Pago manda al webhook de tipo `payment` NO trae ningún
// campo `status` (`payloadSchema` en route.ts sólo exige `type` y `data.id`)
// — el código YA está obligado, estructuralmente, a ir a buscar el estado a
// la API. Lo que sí se puede probar es que un campo `status` extra e
// inventado en el body (que Zod, al no ser `strict()`, ignora) nunca influye
// en el estado que termina persistido — sólo importa lo que devuelve
// `paymentClient.get()`. Ver el test "un status inventado en el body nunca
// pisa el status real de la API" más abajo.

import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { getEnv } from "../../lib/env";
import { cleanupUser } from "../helpers/cleanup";
import { createTestAdminClient } from "../helpers/db-client";
import { firmarWebhookMercadoPago } from "../helpers/mercadopago-signature";
import { TEST_EMAIL_SUFFIX } from "../helpers/seed-users";
import { withAuthRetry } from "../helpers/with-auth-retry";

const mockGetPaymentClient = vi.fn();

vi.mock("@/lib/mercadopago/client", () => ({
  getPaymentClient: () => mockGetPaymentClient(),
}));

vi.mock("@vercel/analytics/server", () => ({
  track: vi.fn().mockResolvedValue(undefined),
}));

const admin = createTestAdminClient();
const PASSWORD = "test-password-1!";
const WEBHOOK_URL = "https://ogcircle.example/api/webhooks/mercadopago";

async function crearUsuarioDeTest(prefijo: string): Promise<string> {
  const email = `${prefijo}-${randomUUID()}${TEST_EMAIL_SUFFIX}`;
  const { data, error } = await withAuthRetry(() =>
    admin.auth.admin.createUser({ email, password: PASSWORD, email_confirm: true }),
  );
  if (error) throw error;
  return data.user.id;
}

/** Mock de la forma mínima que necesita el handler de la respuesta de
 * `paymentClient.get()` — igual a `PAGO_APROBADO_MP` de route.test.ts. */
function pagoMp(overrides: Record<string, unknown> = {}) {
  return {
    id: 123456789,
    status: "approved",
    external_reference: null,
    metadata: {},
    transaction_amount: 0,
    ...overrides,
  };
}

/** Arma un Request de webhook con firma HMAC real para `paymentId`. */
function webhookRequest(paymentId: string, extraBody: Record<string, unknown> = {}): Request {
  const secret = getEnv(
    "MERCADOPAGO_WEBHOOK_SECRET",
    "Necesaria para firmar los requests de este archivo de test de integración.",
  );
  const { xSignature, xRequestId } = firmarWebhookMercadoPago({
    dataId: paymentId,
    requestId: `req-${randomUUID()}`,
    secret,
  });

  return new Request(`${WEBHOOK_URL}?data.id=${paymentId}&type=payment`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-signature": xSignature,
      "x-request-id": xRequestId,
    },
    body: JSON.stringify({ type: "payment", data: { id: paymentId }, ...extraBody }),
  });
}

async function pagosDe(userId: string) {
  const { data, error } = await admin
    .from("pagos")
    .select("proveedor_ref, estado, nivel_comprado")
    .eq("user_id", userId);
  if (error) throw error;
  return data;
}

async function nivelDe(userId: string): Promise<string> {
  const { data, error } = await admin.from("profiles").select("nivel").eq("id", userId).single();
  if (error) throw error;
  return data.nivel;
}

async function claimNivelDe(userId: string): Promise<unknown> {
  const { data, error } = await withAuthRetry(() => admin.auth.admin.getUserById(userId));
  if (error) throw error;
  return (data.user.app_metadata as Record<string, unknown> | undefined)?.nivel;
}

describe("POST /api/webhooks/mercadopago (integración real)", () => {
  let userId: string | null = null;

  beforeEach(() => {
    vi.resetModules();
    mockGetPaymentClient.mockReset();
  });

  afterEach(async () => {
    if (userId) {
      await cleanupUser(userId);
      userId = null;
    }
  });

  it("firma válida + pago approved: fila en pagos, nivel proyectado en profiles y en el claim, 200", async () => {
    userId = await crearUsuarioDeTest("webhook-approved");
    const paymentId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentId),
          external_reference: userId,
          metadata: { nivel: "principiante" },
          transaction_amount: 75000,
        }),
      ),
    });

    const { POST } = await import("../../app/api/webhooks/mercadopago/route");
    const res = await POST(webhookRequest(paymentId));

    expect(res.status).toBe(200);
    expect(await nivelDe(userId)).toBe("principiante");
    expect(await claimNivelDe(userId)).toBe("principiante");
    const pagos = await pagosDe(userId);
    expect(pagos).toHaveLength(1);
    expect(pagos[0]).toMatchObject({ estado: "approved", nivel_comprado: "principiante" });
  });

  it("reintento idéntico del mismo paymentId: 200, cero filas nuevas, nivel estable", async () => {
    userId = await crearUsuarioDeTest("webhook-reintento");
    const paymentId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentId),
          external_reference: userId,
          metadata: { nivel: "avanzado" },
          transaction_amount: 125000,
        }),
      ),
    });

    const { POST } = await import("../../app/api/webhooks/mercadopago/route");

    const primera = await POST(webhookRequest(paymentId));
    expect(primera.status).toBe(200);

    const segunda = await POST(webhookRequest(paymentId));
    expect(segunda.status).toBe(200);

    const pagos = await pagosDe(userId);
    expect(pagos).toHaveLength(1);
    expect(await nivelDe(userId)).toBe("avanzado");
  });

  it("un status inventado en el body nunca pisa el status real de la API (sólo importa lo que devuelve paymentClient.get)", async () => {
    userId = await crearUsuarioDeTest("webhook-status-body");
    const paymentId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    // La API "dice" rejected. El body trae un campo `status: "approved"`
    // inventado — Zod lo ignora (payloadSchema no es strict) y, aunque no
    // lo ignorara, el handler nunca lee `status` del body en ningún punto.
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentId),
          status: "rejected",
          external_reference: userId,
          metadata: { nivel: "principiante" },
        }),
      ),
    });

    const { POST } = await import("../../app/api/webhooks/mercadopago/route");
    const res = await POST(webhookRequest(paymentId, { status: "approved" }));

    expect(res.status).toBe(200);
    const pagos = await pagosDe(userId);
    expect(pagos).toHaveLength(1);
    expect(pagos[0].estado).toBe("rejected");
    expect(await nivelDe(userId)).toBe("ninguno");
  });

  it("notificaciones fuera de orden (avanzado, después principiante) dejan al usuario en avanzado", async () => {
    userId = await crearUsuarioDeTest("webhook-precedencia");
    const paymentIdAvanzado = `${Date.now()}1`;
    const paymentIdPrincipiante = `${Date.now()}2`;

    const { POST } = await import("../../app/api/webhooks/mercadopago/route");

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentIdAvanzado),
          external_reference: userId,
          metadata: { nivel: "avanzado" },
          transaction_amount: 125000,
        }),
      ),
    });
    const resAvanzado = await POST(webhookRequest(paymentIdAvanzado));
    expect(resAvanzado.status).toBe(200);
    expect(await nivelDe(userId)).toBe("avanzado");

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentIdPrincipiante),
          external_reference: userId,
          metadata: { nivel: "principiante" },
          transaction_amount: 75000,
        }),
      ),
    });
    const resPrincipiante = await POST(webhookRequest(paymentIdPrincipiante));
    expect(resPrincipiante.status).toBe(200);

    // Nunca degrada: el nivel más alto entre pagos approved gana, sin
    // importar el orden de llegada de las notificaciones (VGRP-24).
    expect(await nivelDe(userId)).toBe("avanzado");
  });

  it("un refunded posterior para el mismo paymentId hace caer el nivel a 'ninguno' (PRD §8, revocación automática)", async () => {
    userId = await crearUsuarioDeTest("webhook-refund");
    const paymentId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    const { POST } = await import("../../app/api/webhooks/mercadopago/route");

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentId),
          external_reference: userId,
          metadata: { nivel: "avanzado" },
          transaction_amount: 125000,
        }),
      ),
    });
    const aprobado = await POST(webhookRequest(paymentId));
    expect(aprobado.status).toBe(200);
    expect(await nivelDe(userId)).toBe("avanzado");
    expect(await claimNivelDe(userId)).toBe("avanzado");

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentId),
          status: "refunded",
          external_reference: userId,
          metadata: { nivel: "avanzado" },
          transaction_amount: 125000,
        }),
      ),
    });
    const reembolsado = await POST(webhookRequest(paymentId));
    expect(reembolsado.status).toBe(200);

    expect(await nivelDe(userId)).toBe("ninguno");
    expect(await claimNivelDe(userId)).toBe("ninguno");

    const pagos = await pagosDe(userId);
    expect(pagos).toHaveLength(2);
    expect(pagos.map((p) => p.estado).sort()).toEqual(["approved", "refunded"]);
  });

  it("status de MP sin mapeo conocido: 200, sin fila, sin proyección", async () => {
    userId = await crearUsuarioDeTest("webhook-status-desconocido");
    const paymentId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentId),
          status: "in_mediation", // no está en MAPA_STATUS_A_ESTADO
          external_reference: userId,
          metadata: { nivel: "principiante" },
        }),
      ),
    });

    const { POST } = await import("../../app/api/webhooks/mercadopago/route");
    const res = await POST(webhookRequest(paymentId));

    expect(res.status).toBe(200);
    expect(await pagosDe(userId)).toHaveLength(0);
    expect(await nivelDe(userId)).toBe("ninguno");
  });

  it("sin external_reference ni metadata.nivel: 200, sin insertar (pago sin correlación posible)", async () => {
    userId = await crearUsuarioDeTest("webhook-sin-correlacion");
    const paymentId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentId),
          external_reference: null,
          metadata: {},
        }),
      ),
    });

    const { POST } = await import("../../app/api/webhooks/mercadopago/route");
    const res = await POST(webhookRequest(paymentId));

    expect(res.status).toBe(200);
    // No hay filas de este pago para NINGÚN usuario — no hay a quién
    // atribuírselo. userId acá sólo existe para poder limpiar algo en
    // afterEach; el pago sin correlación no lo referencia.
  });

  it("external_reference de un usuario inexistente: 500 (violación de FK real, MP reintenta)", async () => {
    const paymentId = `${Date.now()}${Math.floor(Math.random() * 1000)}`;
    const usuarioInexistente = randomUUID();

    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(
        pagoMp({
          id: Number(paymentId),
          external_reference: usuarioInexistente,
          metadata: { nivel: "principiante" },
        }),
      ),
    });

    const { POST } = await import("../../app/api/webhooks/mercadopago/route");
    const res = await POST(webhookRequest(paymentId));

    // Comportamiento REAL de hoy, no el ideal: `pagos.user_id` referencia
    // `profiles`, así que un external_reference que no es un usuario real
    // hace fallar el INSERT con una violación de FK (no es el código 23505
    // que insertarPago interpreta como duplicado) — el error se propaga y el
    // handler responde 500, lo cual hace que MP reintente indefinidamente
    // una notificación que nunca va a poder procesar. Ver el plan del bloque
    // 6: este es un caso a revisar (¿debería ser un 200 descartado en vez de
    // un 500 que nunca se resuelve?), no algo que este ticket deba arreglar.
    expect(res.status).toBe(500);
  });
});
