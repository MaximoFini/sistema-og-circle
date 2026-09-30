// VGRP-57 — tests unitarios de POST /api/cotizador/identificar-ncm. Mockeados:
// getVerifiedClaims (patrón de app/api/agentes/route.test.ts), el SDK de
// Anthropic (sólo el cliente; las clases de error son las reales) y Sentry.
// Sin red ni ANTHROPIC_API_KEY real.

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
const CANDIDATOS = [
  { ncm: "6404.11.00.100A", descripcion: "Calzado de deporte" },
  { ncm: "6402.19.00.900X", descripcion: "Los demás calzados" },
  { ncm: "6403.99.90.900K", descripcion: "Calzado de cuero" },
];

function post(body: unknown): Request {
  return new Request("http://localhost/api/cotizador/identificar-ncm", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body),
  });
}

async function call(body: unknown) {
  const { POST } = await import("./route");
  return POST(post(body));
}

const respuestaIA = (input: unknown) => ({
  content: [{ type: "tool_use", id: "t1", name: "emitir_resultado", input }],
});

describe("POST /api/cotizador/identificar-ncm", () => {
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

    const res = await call({ query: "zapas", candidates: CANDIDATOS });

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno': 403 y NO llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const res = await call({ query: "zapas", candidates: CANDIDATOS });

    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "Necesitás un plan para usar la calculadora." });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    [{ candidates: CANDIDATOS }, 'Falta el parámetro "query".'],
    [{ query: "", candidates: CANDIDATOS }, 'Falta el parámetro "query".'],
    [{ query: "zapas" }, "No se enviaron candidatos NCM para evaluar."],
    [{ query: "zapas", candidates: [] }, "No se enviaron candidatos NCM para evaluar."],
  ])("entrada inválida %j: 400 con el texto del original", async (body, mensaje) => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

    const res = await call(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: mensaje });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("con plan: 200, y al SDK le llega el modelo/prompt/schema del original", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(
      respuestaIA({
        ncm: "6404.11.00.100A",
        confianza: 92,
        razonamiento: "Zapatillas deportivas.",
        alternativas: [
          { ncm: "6402.19.00.900X", motivo: "Si es sintético" },
          { ncm: "9999.99.99.999Z", motivo: "alucinada" },
        ],
      }),
    );

    const res = await call({ query: "zapas", candidates: CANDIDATOS });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      ncm: "6404.11.00.100A",
      confianza: 92,
      razonamiento: "Zapatillas deportivas.",
      // Las alternativas que no están entre los candidatos se descartan.
      alternativas: [{ ncm: "6402.19.00.900X", motivo: "Si es sintético" }],
    });

    const params = mockCreate.mock.calls[0]?.[0];
    expect(params.model).toBe("claude-sonnet-5");
    expect(params.max_tokens).toBe(1200);
    expect(params.system).toContain(
      "Sos un clasificador experto en el Nomenclador Común del Mercosur (NCM)",
    );
    expect(params.system).toContain("Nunca inventás códigos.");
    const texto = params.messages[0].content[0].text as string;
    expect(texto.startsWith('Producto del usuario: "zapas"')).toBe(true);
    expect(texto).toContain(JSON.stringify(CANDIDATOS, null, 2));
    expect(texto).toContain(
      "Incluí hasta 2 alternativas plausibles (o [] si no hay). Sin texto fuera del JSON.",
    );
    expect(params.tool_choice).toEqual({ type: "tool", name: "emitir_resultado" });
    expect(params.tools[0].input_schema.required).toEqual([
      "ncm",
      "confianza",
      "razonamiento",
      "alternativas",
    ]);
  });

  it("ANTHROPIC_MODEL_IDENTIFY sobreescribe el modelo", async () => {
    vi.stubEnv("ANTHROPIC_MODEL_IDENTIFY", "otro-modelo");
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(
      respuestaIA({ ncm: "6404.11.00.100A", confianza: 50, razonamiento: "", alternativas: [] }),
    );

    await call({ query: "zapas", candidates: CANDIDATOS });

    expect(mockCreate.mock.calls[0]?.[0].model).toBe("otro-modelo");
  });

  it("código alucinado: cae al primer candidato con confianza ≤ 40 (post-proceso del original)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(
      respuestaIA({ ncm: "0000", confianza: 95, razonamiento: "x", alternativas: [] }),
    );

    const body = await (await call({ query: "zapas", candidates: CANDIDATOS })).json();

    expect(body.ncm).toBe("6404.11.00.100A");
    expect(body.confianza).toBe(40);
    expect(body.razonamiento).toBe("x (Ajustado al mejor candidato local.)");
  });

  it("recorta a 80 candidatos y sólo manda ncm + descripcion al prompt", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(
      respuestaIA({ ncm: "c0", confianza: 50, razonamiento: "", alternativas: [] }),
    );
    const muchos = Array.from({ length: 90 }, (_, i) => ({
      ncm: `c${i}`,
      descripcion: `d${i}`,
      sim: `extra${i}`,
    }));

    await call({ query: "algo", candidates: muchos });

    const texto = mockCreate.mock.calls[0]?.[0].messages[0].content[0].text as string;
    expect(texto).toContain('"ncm": "c79"');
    expect(texto).not.toContain('"ncm": "c80"');
    expect(texto).not.toContain("extra");
  });

  it("si la IA falla (3 intentos): 502 genérico, sin el detalle crudo, y va a Sentry", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockRejectedValue(
      APIError.generate(529, { error: { message: "detalle-crudo-xyz" } }, "x", new Headers()),
    );

    const res = await call({ query: "zapas", candidates: CANDIDATOS });

    expect(res.status).toBe(502);
    const body = await res.json();
    expect(body).toEqual({ error: expect.any(String) });
    expect(JSON.stringify(body)).not.toContain("detalle-crudo-xyz");
    expect(mockCreate).toHaveBeenCalledTimes(3);
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
