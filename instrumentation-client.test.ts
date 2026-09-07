// VGRP-46 (dentro de VGRP-41) — tests de `instrumentation-client.ts`.
//
// Distinto de `instrumentation.ts`: acá `Sentry.init` corre a nivel de
// MÓDULO (top-level), no dentro de una función exportada. Por eso cada test
// necesita `vi.resetModules()` + reimport dinámico del módulo bajo test,
// seteando `process.env.NEXT_PUBLIC_SENTRY_DSN` (con `vi.stubEnv()`, mismo
// criterio que `lib/config/index.test.ts` e `instrumentation.test.ts`) ANTES
// del import — si el import ya corrió con el env var viejo, `resetModules()`
// solo alcanza reimportando de cero.
//
// Mismo punto crítico que instrumentation.ts: `sendDefaultPii` tiene que ser
// SIEMPRE `false`.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockInit = vi.fn();
const mockCaptureRouterTransitionStart = vi.fn();

vi.mock("@sentry/nextjs", () => ({
  init: (...args: unknown[]) => mockInit(...args),
  captureRouterTransitionStart: mockCaptureRouterTransitionStart,
}));

describe("instrumentation-client", () => {
  beforeEach(() => {
    vi.resetModules();
    mockInit.mockReset();
    mockCaptureRouterTransitionStart.mockReset();
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin NEXT_PUBLIC_SENTRY_DSN, no llama a Sentry.init", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "");

    await import("./instrumentation-client");

    expect(mockInit).not.toHaveBeenCalled();
  });

  it("con NEXT_PUBLIC_SENTRY_DSN seteada, llama a Sentry.init con sendDefaultPii:false", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");

    await import("./instrumentation-client");

    expect(mockInit).toHaveBeenCalledTimes(1);
    expect(mockInit).toHaveBeenCalledWith(
      expect.objectContaining({
        dsn: "https://dsn-de-prueba@sentry.example/1",
        sendDefaultPii: false,
      }),
    );
    // Igual que en instrumentation.test.ts: chequeo aislado del punto
    // crítico, no depende de que el resto del objeto de config coincida.
    const configPasada = mockInit.mock.calls[0]?.[0];
    expect(configPasada.sendDefaultPii).toBe(false);
  });

  it("exporta onRouterTransitionStart delegando en Sentry.captureRouterTransitionStart", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");

    const mod = await import("./instrumentation-client");

    expect(mod.onRouterTransitionStart).toBe(mockCaptureRouterTransitionStart);
  });

  // VGRP-48 — mismo bug real que instrumentation.test.ts: sin esto, un build
  // corrido localmente (a mano, o por Playwright) queda etiquetado
  // `environment: "production"` en Sentry, indistinguible de un deploy real.
  //
  // `NEXT_PUBLIC_APP_ENV` (no `NEXT_PUBLIC_VERCEL_ENV` directo): definida en
  // `next.config.ts` a partir de `VERCEL_ENV`, para no depender del toggle
  // "Automatically expose System Environment Variables" de Vercel — ver el
  // comentario de `instrumentation-client.ts`.
  it("sin NEXT_PUBLIC_APP_ENV (local), Sentry.init recibe environment:'local'", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "");

    await import("./instrumentation-client");

    const configPasada = mockInit.mock.calls[0]?.[0];
    expect(configPasada.environment).toBe("local");
  });

  it("con NEXT_PUBLIC_APP_ENV seteada (deploy real de Vercel, vía next.config.ts), Sentry.init la respeta tal cual", async () => {
    vi.stubEnv("NEXT_PUBLIC_SENTRY_DSN", "https://dsn-de-prueba@sentry.example/1");
    vi.stubEnv("NEXT_PUBLIC_APP_ENV", "preview");

    await import("./instrumentation-client");

    const configPasada = mockInit.mock.calls[0]?.[0];
    expect(configPasada.environment).toBe("preview");
  });
});
