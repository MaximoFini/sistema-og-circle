// VGRP-58 — tests unitarios de POST /api/cotizador/dolar-cda. `fetch` global
// stubeado (sin red real), getVerifiedClaims y Sentry mockeados.
// `vi.resetModules()` por test: la caché de 30 min vive en el módulo.

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
const URL_HISTORIAL = "https://www.cda.org.ar/historial_dolar.php";

// HTML de muestra, con el formato real que espera el regex del original:
// filas <tr><td>fecha</td><td>compra</td><td>venta</td>, la más reciente
// primero.
const HTML_MUESTRA = `
<html><body>
<table class="historial">
  <tr><th>Fecha</th><th>Compra</th><th>Venta</th></tr>
  <tr><td>31/08/2026</td><td>1503.0000</td><td>1512.0000</td></tr>
  <tr><td>28/08/2026</td><td>1498.5000</td><td>1507.5000</td></tr>
</table>
</body></html>
`;

// El sitio cambió el markup: ya no hay filas de la tabla (por ejemplo pasó a
// armarse con <div> o cambió a JS del lado del cliente).
const HTML_MARKUP_CAMBIADO = `
<html><body>
<div class="historial">
  <div>31/08/2026 — 1503,00 / 1512,00</div>
</div>
</body></html>
`;

function html(body: string, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/html" } });
}

function cda(respuesta: () => Response | Promise<Response>) {
  mockFetch.mockImplementation(async (url: string) => {
    if (url !== URL_HISTORIAL) throw new Error(`URL inesperada: ${url}`);
    return respuesta();
  });
}

async function call() {
  const { POST } = await import("./route");
  return POST();
}

describe("POST /api/cotizador/dolar-cda", () => {
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

  it("sin sesión: 401 y no llama al CDA", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);

    const res = await call();

    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno': 403 y NO llama al CDA", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const res = await call();

    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("con plan y HTML de muestra real: filas parseadas correctamente", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    cda(() => html(HTML_MUESTRA));

    const res = await call();

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      fecha: "31/08/2026",
      compra: 1503,
      venta: 1512,
      fuente: "Centro Despachantes de Aduana (cda.org.ar)",
    });
    // Cache-Control lo pone next.config.ts para todo /api/cotizador/:path*,
    // no el handler — mismo criterio que los demás endpoints, ninguno lo
    // reafirma en la respuesta.
  });

  it("HTML sin filas (markup cambiado): 502 con el mensaje de cargar a mano", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    cda(() => html(HTML_MARKUP_CAMBIADO));

    const res = await call();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error:
        "El CDA respondió pero no se pudo leer la tabla (¿cambió el sitio?). Cargá la cotización a mano.",
    });
  });

  it("fetch que tira: 502 con el mensaje de cargar a mano", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockFetch.mockRejectedValue(new Error("network error"));

    const res = await call();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "No se pudo leer la cotización del CDA. Cargala a mano.",
    });
  });

  it("respuesta HTTP no-ok del CDA: 502 con el mensaje de cargar a mano", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    cda(() => html("", 503));

    const res = await call();

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "No se pudo leer la cotización del CDA. Cargala a mano.",
    });
  });

  it("cachea 30 min: la segunda llamada no vuelve a pegarle al CDA", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    cda(() => html(HTML_MUESTRA));

    await call();
    await call();

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
