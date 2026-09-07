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
const mockCaptureException = vi.fn();
const mockCaptureMessage = vi.fn();
const mockTrack = vi.fn();

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

// VGRP-41 — spies sobre @sentry/nextjs para los tests de observabilidad de
// más abajo. Un mock explícito (no-op salvo el spy) es equivalente al
// comportamiento real del SDK sin `SENTRY_DSN` (ver instrumentation.ts): no
// lanza, no hace red. Se usa en TODOS los tests de este archivo (no sólo en
// el describe de observabilidad) porque el route.ts importa `@sentry/nextjs`
// a nivel de módulo.
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
  captureMessage: (...args: unknown[]) => mockCaptureMessage(...args),
}));

vi.mock("@vercel/analytics/server", () => ({
  track: (...args: unknown[]) => mockTrack(...args),
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
    mockCaptureException.mockReset();
    mockCaptureMessage.mockReset();
    mockTrack.mockReset();

    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "test-secret");
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "test-token");

    mockValidarFirma.mockReturnValue(true);
    mockCreateServiceRoleClient.mockReturnValue({});
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(PAGO_APROBADO_MP),
    });
    mockTrack.mockResolvedValue(undefined);
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
  // de esa env var ni la fuerza a estar ausente). Nota (VGRP-46): este
  // archivo ahora sí mockea `@sentry/nextjs` a nivel de módulo (ver el
  // `vi.mock` al principio del archivo, agregado para los tests del describe
  // "observabilidad (VGRP-41)" de más abajo) — pero ese mock es un no-op
  // salvo por los spies de `captureException`/`captureMessage`, exactamente
  // equivalente al comportamiento real del SDK sin `Sentry.init` previo. El
  // objetivo de este test puntual sigue siendo el mismo: probar que el
  // webhook sigue respondiendo 500 (no 502/excepción sin manejar) aunque
  // `Sentry.captureException` se llame sobre un cliente nunca inicializado —
  // es justo el comportamiento fail-open que corre en desarrollo local sin
  // `SENTRY_DSN` seteada.
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

// VGRP-46 (dentro de VGRP-41) — observabilidad del webhook: qué reportador de
// Sentry se llama en cada rama, y que el fail-open sin `SENTRY_DSN` (acá
// simulado mockeando `@sentry/nextjs` completo como no-op salvo los spies,
// igual que hace el SDK real sin `Sentry.init`) nunca tumba las respuestas ya
// cubiertas arriba.
describe("POST /api/webhooks/mercadopago — observabilidad (VGRP-41)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInsertarPago.mockReset();
    mockProyectarNivel.mockReset();
    mockGetPaymentClient.mockReset();
    mockValidarFirma.mockReset();
    mockCreateServiceRoleClient.mockReset();
    mockNotificarPagoAprobado.mockReset();
    mockCaptureException.mockReset();
    mockCaptureMessage.mockReset();
    mockTrack.mockReset();

    vi.stubEnv("MERCADOPAGO_WEBHOOK_SECRET", "test-secret");
    vi.stubEnv("MERCADOPAGO_ACCESS_TOKEN", "test-token");

    mockValidarFirma.mockReturnValue(true);
    mockCreateServiceRoleClient.mockReturnValue({});
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue(PAGO_APROBADO_MP),
    });
    mockTrack.mockResolvedValue(undefined);
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("estado no mapeable (mapearEstadoMercadoPago devuelve null) llama a Sentry.captureMessage con severidad 'warning', nunca a captureException", async () => {
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue({
        ...PAGO_APROBADO_MP,
        status: "un_status_que_mp_todavia_no_documenta",
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
    expect(mockCaptureMessage).toHaveBeenCalledTimes(1);
    expect(mockCaptureMessage).toHaveBeenCalledWith(expect.any(String), "warning");
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  // docs/OBSERVABILIDAD.md ("Alert Rule — la alerta por email del fallo del
  // webhook"): "el `extra.detalle` que manda `reportarFalloDeProcesamiento`
  // incluye el string `mercadopago-webhook`, sirve para armar el filtro" —
  // ese es el filtro real de la Alert Rule de Sentry. Si el nombre cambia acá
  // sin actualizar ese documento, este test se pone en rojo.
  it("un fallo real (excepción del try/catch general) llama a Sentry.captureException con extra.detalle conteniendo 'mercadopago-webhook'", async () => {
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error("timeout consultando la API de MP")),
    });

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(500);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [errorPasado, contexto] = mockCaptureException.mock.calls[0] as [
      unknown,
      { extra: { detalle: string } },
    ];
    expect(errorPasado).toBeInstanceOf(Error);
    expect(contexto.extra.detalle).toContain("mercadopago-webhook");
  });

  it("track('pago_aprobado', {nivel}) se llama sólo cuando el pago está aprobado y proyectarNivel resuelve sin tirar", async () => {
    mockInsertarPago.mockResolvedValue({ inserted: true, pago: { id: "pago-1" } });
    mockProyectarNivel.mockResolvedValue("principiante");

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith("pago_aprobado", { nivel: "principiante" });
  });

  it("no llama a track('pago_aprobado', ...) cuando el pago no queda approved (ej. refunded)", async () => {
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockResolvedValue({ ...PAGO_APROBADO_MP, status: "refunded" }),
    });
    mockInsertarPago.mockResolvedValue({ inserted: true, pago: { id: "pago-1" } });
    mockProyectarNivel.mockResolvedValue("ninguno");

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(200);
    expect(mockTrack).not.toHaveBeenCalled();
  });

  it("si track('pago_aprobado') tira, el webhook igual responde 200 (fail-open, mismo patrón que notificarPagoAprobado)", async () => {
    mockInsertarPago.mockResolvedValue({ inserted: true, pago: { id: "pago-1" } });
    mockProyectarNivel.mockResolvedValue("principiante");
    mockTrack.mockRejectedValue(new Error("analytics caído"));

    const { POST } = await import("./route");
    const res = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );

    expect(res.status).toBe(200);
    // El fallo de track() se reporta igual que cualquier otro fallo fire-and-
    // forget de esta rama (ver comentario de route.ts junto a
    // `reportarFalloDeProcesamiento("track('pago_aprobado') falló", error)`),
    // pero nunca debe tumbar la respuesta 200.
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it("sin SENTRY_DSN, los tres reportadores internos (mockeados como no-op) no rompen las respuestas normales del webhook", async () => {
    vi.stubEnv("SENTRY_DSN", "");

    // Reusa los tres casos ya cubiertos arriba (200 por duplicado, 401 por
    // firma inválida, 500 por fallo real) para confirmar indirectamente que
    // reportarProblemaDeHook/reportarFalloDeProcesamiento/reportarPagoSinCorrelacion
    // (no exportadas) no explotan cuando Sentry no está inicializado — acá el
    // mock de @sentry/nextjs es no-op salvo los spies, igual que el SDK real
    // sin DSN.
    mockInsertarPago.mockResolvedValue({ inserted: false, motivo: "duplicado" });
    const { POST } = await import("./route");

    const resDuplicado = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );
    expect(resDuplicado.status).toBe(200);

    mockValidarFirma.mockReturnValue(false);
    const resFirmaInvalida = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=malo",
        "x-request-id": "req-1",
      }),
    );
    expect(resFirmaInvalida.status).toBe(401);

    mockValidarFirma.mockReturnValue(true);
    mockGetPaymentClient.mockReturnValue({
      get: vi.fn().mockRejectedValue(new Error("fallo de red inesperado")),
    });
    const resFalloReal = await POST(
      req("https://ogcircle.example/api/webhooks/mercadopago?data.id=123456789&type=payment", {
        "x-signature": "ts=1700000000000,v1=deadbeef",
        "x-request-id": "req-1",
      }),
    );
    expect(resFalloReal.status).toBe(500);
  });
});
