// VGRP-23 — tests de idempotencia del webhook de Mercado Pago.
//
// Mockea `insertarPago`/`proyectarNivel` (lib/data/pagos), el cliente de
// service role, el cliente de pagos del SDK de MP y la validación de firma —
// mismo estilo de mock que `lib/mercadopago/preferencia.test.ts`
// (`vi.mock` + funciones espía, import dinámico del módulo bajo test tras
// `vi.resetModules()`, igual que `middleware.test.ts`). No pega a la red real
// ni a Supabase: el foco es sólo la propiedad de idempotencia — cuando
// `insertarPago` devuelve `{ inserted: false }`, el handler NO debe llamar a
// `proyectarNivel`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInsertarPago = vi.fn();
const mockProyectarNivel = vi.fn();
const mockGetPaymentClient = vi.fn();
const mockValidarFirma = vi.fn();
const mockCreateServiceRoleClient = vi.fn();
const mockNotificarPagoAprobado = vi.fn();

vi.mock("@/lib/data/pagos", () => ({
  insertarPago: (...args: unknown[]) => mockInsertarPago(...args),
  proyectarNivel: (...args: unknown[]) => mockProyectarNivel(...args),
}));

vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

vi.mock("@/lib/mercadopago/client", () => ({
  getPaymentClient: () => mockGetPaymentClient(),
}));

vi.mock("@/lib/mercadopago/validarFirma", () => ({
  validarFirmaMercadoPago: (...args: unknown[]) => mockValidarFirma(...args),
}));

vi.mock("@/lib/email/pago-aprobado", () => ({
  notificarPagoAprobado: (...args: unknown[]) => mockNotificarPagoAprobado(...args),
}));

const PAGO_APROBADO_MP = {
  id: 123456789,
  status: "approved",
  external_reference: "user-123",
  metadata: { nivel: "principiante" },
  transaction_amount: 75000,
};

function req(url: string, headers: Record<string, string> = {}): Request {
  return new Request(url, {
    method: "POST",
    headers: { "content-type": "application/json", ...headers },
    body: JSON.stringify({ type: "payment", data: { id: "123456789" } }),
  });
}

describe("POST /api/webhooks/mercadopago", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInsertarPago.mockReset();
    mockProyectarNivel.mockReset();
    mockGetPaymentClient.mockReset();
    mockValidarFirma.mockReset();
    mockCreateServiceRoleClient.mockReset();
    mockNotificarPagoAprobado.mockReset();

    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "test-secret");
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "test-token");

    mockValidarFirma.mockReturnValue(true);
    mockCreateServiceRoleClient.mockReturnValue({});
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(PAGO_APROBADO_MP),
    });
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("no llama a proyectarNivel cuando insertarPago devuelve inserted:false (duplicado)", async () => {
    mockInsertarPago.mockResolvedValue({ inserted: false, motivo: "duplicado" });

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockInsertarPago).toHaveBeenCalledTimes(1);
    expect(mockProyectarNivel).not.toHaveBeenCalled();
  });

  it("llama a proyectarNivel cuando insertarPago inserta un pago approved", async () => {
    mockInsertarPago.mockResolvedValue({
      inserted: true,
      pago: { id: "pago-1" },
    });
    mockProyectarNivel.mockResolvedValue("principiante");

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockProyectarNivel).toHaveBeenCalledTimes(1);
    expect(mockProyectarNivel).toHaveBeenCalledWith(expect.anything(), "user-123");
  });

  it("no llama a insertarPago ni a la API de MP cuando la firma es inválida (401)", async () => {
    mockValidarFirma.mockReturnValue(false);

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=malo",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(401);
    expect(mockGetPaymentClient).not.toHaveBeenCalled();
    expect(mockInsertarPago).not.toHaveBeenCalled();
  });

  it("responde 200 sin procesar cuando type !== 'payment'", async () => {
    mockValidarFirma.mockReturnValue(true);

    const { POST } = await import("./route");
    const res = await POST(
      new Request(
        "https://ogcircle.example/api/webhooks/mercadopago?data.id=1&type=merchant_order",
        {
          method: "POST",
          headers: {
            "content-type": "application/json",
            "x-signature": "ts=1700000000000,v1=deadbeef",
            "x-request-id": "req-1",
          },
          body: JSON.stringify({ type: "merchant_order", data: { id: "1" } }),
        },
      ),
    );

    expect(res.status).toBe(200);
    expect(mockGetPaymentClient).not.toHaveBeenCalled();
  });

  it("responde 500 cuando MERCADOPAGO_WEBHOOK_SECRET no está configurada", async () => {
    vi.unstubAllEnvs();
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "test-token");

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(500);
  });

  it("responde 200 sin insertar cuando falta external_reference o metadata.nivel", async () => {
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        ...PAGO_APROBADO_MP,
        external_reference: null,
      }),
    });

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockInsertarPago).not.toHaveBeenCalled();
  });

  it("responde 500 cuando insertarPago lanza un error real (no duplicado)", async () => {
    mockInsertarPago.mockRejectedValue(new Error("fallo de red inesperado"));

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(500);
  });

  // VGRP-41 — Vitest nunca ejecuta el hook `register()` de
  // `instrumentation.ts` (es específico del runtime de Next.js), así que
  // `Sentry.init()` nunca corre en NINGÚN test de esta suite, sin importar
  // qué valor tenga `SENTRY_DSN` en el entorno (por eso este test no depende
  // de esa env var ni la fuerza a estar ausente). Este test no mockea
  // `@sentry/nextjs` a propósito — el objetivo es probar que el webhook
  // sigue respondiendo 500 (no 502/excepción sin manejar) aunque
  // `Sentry.captureException` se llame sobre un cliente nunca inicializado:
  // el propio SDK lo no-opea, es justo el comportamiento fail-open que
  // corre en desarrollo local sin `SENTRY_DSN` seteada.
  it("responde 500 sin romperse cuando insertarPago falla y Sentry no está inicializado (fail-open)", async () => {
    mockInsertarPago.mockRejectedValue(new Error("fallo de red inesperado"));

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(500);
  });
});
