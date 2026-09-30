// VGRP-57 — tests unitarios de POST /api/cotizador/dolar. `fetch` global
// stubeado (sin red real), getVerifiedClaims y Sentry mockeados.
// `vi.resetModules()` por test: la caché de 10 min vive en el módulo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerifiedClaims = vi.fn();
const mockFetch = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const CON_PLAN = { app_metadata: { nivel: "principiante" } };
const URL_BNA = "https://dolarapi.com/v1/dolares/oficial";
const URL_CCL = "https://dolarapi.com/v1/dolares/contadoconliqui";

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });

function dolarapi(respuestas: Record<string, () => Response | Promise<Response>>) {
  mockFetch.mockImplementation(async (url: string) => {
    const r = respuestas[url];
    if (!r) throw new Error(`URL inesperada: ${url}`);
    return r();
  });
}

async function call() {
  const { POST } = await import("./route");
  return POST();
}

describe("POST /api/cotizador/dolar", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockFetch.mockReset();
    mockCaptureException.mockReset();
    vi.stubGlobal("fetch", mockFetch);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.useRealTimers();
  });

  it("sin sesión: 401 y no llama a dolarapi", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);

    const res = await call();

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno': 403 y NO llama a dolarapi", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const res = await call();

    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("con plan: 200 con el shape del original (BNA + CCL)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    dolarapi({
      [URL_BNA]: () =>
        json({ compra: 1400, venta: 1450, fechaActualizacion: "2026-09-26T15:00:00Z" }),
      [URL_CCL]: () =>
        json({ compra: 1500, venta: 1520, fechaActualizacion: "2026-09-26T15:01:00Z" }),
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      venta: 1450,
      compra: 1400,
      fecha: "2026-09-26T15:00:00Z",
      fuente: "BNA oficial (dolarapi.com)",
      ccl: {
        venta: 1520,
        compra: 1500,
        fecha: "2026-09-26T15:01:00Z",
        fuente: "CCL (dolarapi.com)",
      },
    });
  });

  it("CCL caído: 200 con ccl=null (no es obligatorio)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    dolarapi({
      [URL_BNA]: () => json({ compra: 1400, venta: 1450, fechaActualizacion: null }),
      [URL_CCL]: () => {
        throw new Error("timeout");
      },
    });

    const res = await call();

    expect(res.status).toBe(200);
    expect((await res.json()).ccl).toBeNull();
  });

  it("BNA con venta inválida: 502 'Cotización BNA inválida. Cargala a mano.'", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    dolarapi({
      [URL_BNA]: () => json({ venta: 0 }),
      [URL_CCL]: () => json({ venta: 1520 }),
    });

    const res = await call();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Cotización BNA inválida. Cargala a mano." });
  });

  it("BNA no responde: 502 'No se pudo obtener la cotización. Cargala a mano.'", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    dolarapi({
      [URL_BNA]: () => {
        throw new Error("ECONNREFUSED");
      },
      [URL_CCL]: () => json({ venta: 1520 }),
    });

    const res = await call();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "No se pudo obtener la cotización. Cargala a mano.",
    });
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it("caché de 10 minutos: la segunda request dentro del TTL no vuelve a llamar a dolarapi, pero SÍ pasa por el guard", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    dolarapi({
      [URL_BNA]: () => json({ compra: 1400, venta: 1450 }),
      [URL_CCL]: () => json({ compra: 1500, venta: 1520 }),
    });
    const { POST } = await import("./route");

    await POST();
    expect(mockFetch).toHaveBeenCalledTimes(2);

    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });
    expect((await POST()).status).toBe(403);

    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    const res = await POST();
    expect(res.status).toBe(200);
    expect((await res.json()).venta).toBe(1450);
    expect(mockFetch).toHaveBeenCalledTimes(2);
  });
});
