// VGRP-46 (dentro de VGRP-41) — tests de `register()` de `instrumentation.ts`.
//
// Mismo estilo que `app/api/webhooks/mercadopago/route.test.ts`: `vi.mock()`
// de `@sentry/nextjs` con un spy en `init`, `vi.resetModules()` +
// `vi.stubEnv()`/`vi.unstubAllEnvs()` para las env vars (mismo criterio que
// `lib/config/index.test.ts`), e import dinámico del módulo bajo test dentro
// de cada test.
//
// El punto crítico de este archivo: `sendDefaultPii` tiene que ser SIEMPRE
// `false` en cualquier llamada a `Sentry.init` — este proyecto maneja datos
// de pago (Mercado Pago) y tokens de sesión (Supabase Auth). Si alguna vez
// alguien cambia eso a `true` (a mano o por un default nuevo del SDK que se
// filtre a la config), este test tiene que ponerse en rojo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInit = vi.fn();
const mockCaptureRequestError = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureRequestError: (...args: unknown[]) => mockCaptureRequestError(...args),
}));

describe("register()", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInit.mockReset();
    mockCaptureRequestError.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin SENTRY_DSN, no importa @sentry/nextjs ni llama a Sentry.init", async () => {
    vi.stubEnv("SENTRY_DSN", "");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    const { register } = await import("./instrumentation");
    await register();

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("con SENTRY_DSN y NEXT_RUNTIME='nodejs', llama a Sentry.init con sendDefaultPii:false", async () => {
    vi.stubEnv("SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");

    const { register } = await import("./instrumentation");
    await register();

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://dsn-de-prueba@sentry.example/1",
        sendDefaultPii: false,
      }),
    );
    // Chequeo explícito y aislado del punto crítico: si `sendDefaultPii`
    // pasara a `true` en cualquier refactor futuro, esta línea sola alcanza
    // para que el test falle, sin depender de que el resto del objeto
    // también coincida.
    const configPasada = mockInit.mock.calls[0]?.[0];
    expect(configPasada.sendDefaultPii).toBe(false);
  });

  it("con SENTRY_DSN y NEXT_RUNTIME='edge', llama a Sentry.init con sendDefaultPii:false", async () => {
    vi.stubEnv("SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");
    vi.stubEnv("NEXT_RUNTIME", "edge");

    const { register } = await import("./instrumentation");
    await register();

    expect(mockInit).toHaveBeenCalledTimes(1);
    const configPasada = mockInit.mock.calls[0]?.[0];
    expect(configPasada.sendDefaultPii).toBe(false);
  });

  it("con SENTRY_DSN pero NEXT_RUNTIME distinto de 'nodejs'/'edge', no llama a Sentry.init", async () => {
    vi.stubEnv("SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");
    vi.stubEnv("NEXT_RUNTIME", "");

    const { register } = await import("./instrumentation");
    await register();

    expect(mockInit).not.toHaveBeenCalled();
  });

  // VGRP-48 — bug real: sin esto, un build o test corrido en una máquina
  // local queda etiquetado `environment: "production"` en Sentry (el SDK lo
  // infiere de NODE_ENV), indistinguible de un deploy real, y dispara la
  // Alert Rule de verdad. `VERCEL_ENV` sólo existe en deploys reales de
  // Vercel — nunca en local.
  it("sin VERCEL_ENV (local), Sentry.init recibe environment:'local'", async () => {
    vi.stubEnv("SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("VERCEL_ENV", "");

    const { register } = await import("./instrumentation");
    await register();

    const configPasada = mockInit.mock.calls[0]?.[0];
    expect(configPasada.environment).toBe("local");
  });

  it("con VERCEL_ENV seteada (deploy real de Vercel), Sentry.init la respeta tal cual", async () => {
    vi.stubEnv("SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");
    vi.stubEnv("NEXT_RUNTIME", "nodejs");
    vi.stubEnv("VERCEL_ENV", "preview");

    const { register } = await import("./instrumentation");
    await register();

    const configPasada = mockInit.mock.calls[0]?.[0];
    expect(configPasada.environment).toBe("preview");
  });
});

describe("onRequestError()", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInit.mockReset();
    mockCaptureRequestError.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin SENTRY_DSN, no llama a Sentry.captureRequestError (fail-open)", async () => {
    vi.stubEnv("SENTRY_DSN", "");

    const { onRequestError } = await import("./instrumentation");
    await onRequestError(new Error("boom"), {} as never, {} as never);

    expect(mockCaptureRequestError).not.toHaveBeenCalled();
  });

  it("con SENTRY_DSN, delega en Sentry.captureRequestError", async () => {
    vi.stubEnv("SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");

    const { onRequestError } = await import("./instrumentation");
    const error = new Error("boom");
    await onRequestError(error, {} as never, {} as never);

    expect(mockCaptureRequestError).toHaveBeenCalledTimes(1);
  });
});
