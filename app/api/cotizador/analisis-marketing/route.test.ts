// VGRP-57 — tests unitarios de POST /api/cotizador/analisis-marketing. Mismo
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

const CON_PLAN = { app_metadata: { nivel: "principiante" } };

async function call(body: unknown) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/cotizador/analisis-marketing", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const texto = (t: string) => ({ content: [{ type: "text", text: t }] });

describe("POST /api/cotizador/analisis-marketing", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockCreate.mockReset();
    mockCaptureException.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "clave-de-prueba-no-real");
    vi.stubEnv("ANTHROPIC_MODEL_ANALYZE", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin sesión: 401 y no llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);

    const res = await call({ producto: "zapatillas" });

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno': 403 y NO llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const res = await call({ producto: "zapatillas" });

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([{}, { producto: "" }])("sin producto %j: 400 con el texto del original", async (b) => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

    const res = await call(b);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta el nombre del producto." });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("con plan: 200, modelo/prompt del original, sin tool use, y arrays normalizados", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(
      texto(
        '```json\n{"publicoObjetivo":"runners","angulosVenta":"precio","ideasContenido":["a","",null,"b"],' +
          '"campanaSugerida":"c","precioSugerido":"p","riesgoPrincipal":"r"}\n```',
      ),
    );

    const res = await call({
      producto: "zapatillas",
      ncm: "6404.11.00.100A",
      costos: { total: 100 },
      mercado: "Córdoba",
    });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      publicoObjetivo: "runners",
      angulosVenta: ["precio"],
      ideasContenido: ["a", "b"],
      campanaSugerida: "c",
      precioSugerido: "p",
      riesgoPrincipal: "r",
    });

    const params = mockCreate.mock.calls[0]?.[0];
    expect(params.model).toBe("claude-opus-4-8");
    expect(params.max_tokens).toBe(1600);
    expect(params.system).toContain("Sos un estratega de marketing y comercio para VEGROUP");
    expect(params).not.toHaveProperty("tools");
    expect(params).not.toHaveProperty("tool_choice");
    const prompt = params.messages[0].content[0].text as string;
    expect(prompt).toContain("Producto: zapatillas\nPosición NCM: 6404.11.00.100A\n");
    expect(prompt).toContain('Resumen de costos (USD): {"total":100}');
    expect(prompt).toContain("Contexto adicional: Córdoba");
    expect(prompt.endsWith("Sé concreto y accionable. Sin texto fuera del JSON.")).toBe(true);
  });

  it("líneas opcionales vacías se omiten del prompt (filter(Boolean) del original)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(texto("{}"));

    await call({ producto: "zapatillas", ncm: null });

    const prompt = mockCreate.mock.calls[0]?.[0].messages[0].content[0].text as string;
    expect(prompt).not.toContain("Posición NCM");
    expect(prompt).not.toContain("Resumen de costos");
    expect(prompt).not.toContain("Contexto adicional");
  });

  it("ANTHROPIC_MODEL_ANALYZE sobreescribe el modelo", async () => {
    vi.stubEnv("ANTHROPIC_MODEL_ANALYZE", "otro-modelo");
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(texto("{}"));

    await call({ producto: "x" });

    expect(mockCreate.mock.calls[0]?.[0].model).toBe("otro-modelo");
  });

  it("respuesta sin JSON: 502", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(texto("no sé"));

    const res = await call({ producto: "x" });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "El modelo no devolvió JSON válido." });
  });

  it("si la IA falla: 502 genérico sin detalle crudo (un solo intento, como el original)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockRejectedValue(
      APIError.generate(529, { error: { message: "detalle-crudo-xyz" } }, "x", new Headers()),
    );

    const res = await call({ producto: "x" });

    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("detalle-crudo-xyz");
    expect(mockCreate).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
