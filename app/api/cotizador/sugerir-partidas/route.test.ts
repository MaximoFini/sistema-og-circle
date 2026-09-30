// VGRP-57 — tests unitarios de POST /api/cotizador/sugerir-partidas. Mismo
// esquema de mocks que identificar-ncm/route.test.ts.

import { APIError } from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerifiedClaims = vi.fn();
const mockCreate = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    messages = { create: (...args: unknown[]) => mockCreate(...args) };
  }
  return { ...actual, default: FakeAnthropic };
});

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const CON_PLAN = { app_metadata: { nivel: "avanzado" } };

async function call(body: unknown) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/cotizador/sugerir-partidas", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const respuestaIA = (input: unknown) => ({
  content: [{ type: "tool_use", id: "t1", name: "emitir_resultado", input }],
});

describe("POST /api/cotizador/sugerir-partidas", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockCreate.mockReset();
    mockCaptureException.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "clave-de-prueba-no-real");
    vi.stubEnv("ANTHROPIC_MODEL_IDENTIFY", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin sesión: 401 y no llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);

    const res = await call({ query: "zapas" });

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno': 403 y NO llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const res = await call({ query: "zapas" });

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([{}, { query: "" }, { query: 42 }])(
    "entrada inválida %j: 400 con el texto del original",
    async (body) => {
      mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

      const res = await call(body);

      expect(res.status).toBe(400);
      expect(await res.json()).toEqual({ error: 'Falta el parámetro "query".' });
      expect(mockCreate).not.toHaveBeenCalled();
    },
  );

  it("con plan: 200 { partidas, interpretacion }, normalizando partidas como el original", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(
      respuestaIA({
        interpretacion: "zapatillas deportivas",
        partidas: ["6404", "64.02", "12", 6403, "6405", "6406", "9404", "4202"],
      }),
    );

    const res = await call({ query: "zapas" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      partidas: ["6404", "6402", "6403", "6405", "6406", "9404"],
      interpretacion: "zapatillas deportivas",
    });

    const params = mockCreate.mock.calls[0]?.[0];
    expect(params.model).toBe("claude-sonnet-5");
    expect(params.max_tokens).toBe(800);
    expect(params.system).toContain('"zapa"/"zapas" = zapatillas');
    expect(params.messages[0].content[0].text).toBe(
      [
        'Producto: "zapas"',
        "",
        "Devolvé UNICAMENTE un JSON con esta forma exacta:",
        '{ "interpretacion": "<qué es el producto, 2-5 palabras>", "partidas": ["6404", "6402"] }',
        "Hasta 6 partidas de 4 dígitos, ordenadas de más a menos probable.",
        "Sin texto fuera del JSON.",
      ].join("\n"),
    );
    expect(params.tool_choice).toEqual({ type: "tool", name: "emitir_resultado" });
    expect(params.tools[0].input_schema.required).toEqual(["interpretacion", "partidas"]);
  });

  it("si el primer intento no trae partidas válidas, hace un segundo intento completo", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate
      .mockResolvedValueOnce(respuestaIA({ interpretacion: "x", partidas: [] }))
      .mockResolvedValueOnce(respuestaIA({ interpretacion: "y", partidas: ["8518"] }));

    const body = await (await call({ query: "auris" })).json();

    expect(body).toEqual({ partidas: ["8518"], interpretacion: "y" });
    expect(mockCreate).toHaveBeenCalledTimes(2);
  });

  it("dos intentos sin partidas: 502 con el texto del original", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(respuestaIA({ interpretacion: "x", partidas: ["abc"] }));

    const res = await call({ query: "cosa rara" });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({
      error: "La IA no pudo sugerir partidas para ese producto.",
    });
  });

  it("si la IA falla: 502 genérico sin detalle crudo", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockRejectedValue(
      APIError.generate(500, { error: { message: "detalle-crudo-xyz" } }, "x", new Headers()),
    );

    const res = await call({ query: "zapas" });

    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("detalle-crudo-xyz");
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
