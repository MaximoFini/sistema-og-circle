// VGRP-57 — tests unitarios de POST /api/cotizador/analisis-marketing. Mismo
// esquema de mocks que identificar-ncm/route.test.ts, con `messages.stream`
// en vez de `messages.create`: el endpoint transmite en NDJSON.

import { APIError } from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerifiedClaims = vi.fn();
const mockStream = vi.fn();
const mockAbort = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    messages = { stream: (...args: unknown[]) => mockStream(...args) };
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

/** Un `MessageStream` falso: emite `trozos` como deltas de texto. Si recibe
 *  un error, lo lanza en vez de emitir (como el SDK cuando la API falla). */
function flujo(...trozos: (string | Error)[]) {
  return {
    abort: mockAbort,
    async *[Symbol.asyncIterator]() {
      yield { type: "message_start" };
      for (const t of trozos) {
        if (t instanceof Error) throw t;
        yield { type: "content_block_delta", delta: { type: "text_delta", text: t } };
      }
      yield { type: "message_stop" };
    },
  };
}

/** Los eventos NDJSON de una respuesta 200. */
async function eventos(res: Response) {
  return (await res.text())
    .split("\n")
    .filter(Boolean)
    .map((l) => JSON.parse(l));
}

describe("POST /api/cotizador/analisis-marketing", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockStream.mockReset();
    mockAbort.mockReset();
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
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno': 403 y NO llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const res = await call({ producto: "zapatillas" });

    expect(res.status).toBe(403);
    expect(mockStream).not.toHaveBeenCalled();
  });

  it.each([{}, { producto: "" }])("sin producto %j: 400 con el texto del original", async (b) => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

    const res = await call(b);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "Falta el nombre del producto." });
    expect(mockStream).not.toHaveBeenCalled();
  });

  it("con plan: 200 NDJSON con cada fragmento y el análisis normalizado al final; modelo/prompt del original, sin tool use", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    const trozos = [
      '```json\n{"publicoObjetivo":"runners","angulosVenta":"precio",',
      '"ideasContenido":["a","",null,"b"],',
      '"campanaSugerida":"c","precioSugerido":"p","riesgoPrincipal":"r"}\n```',
    ];
    mockStream.mockReturnValue(flujo(...trozos));

    const res = await call({
      producto: "zapatillas",
      ncm: "6404.11.00.100A",
      costos: { total: 100 },
      mercado: "Córdoba",
    });

    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("application/x-ndjson; charset=utf-8");
    expect(res.headers.get("cache-control")).toBe("private, no-store");
    expect(await eventos(res)).toEqual([
      ...trozos.map((texto) => ({ tipo: "texto", texto })),
      {
        tipo: "fin",
        analisis: {
          publicoObjetivo: "runners",
          angulosVenta: ["precio"],
          ideasContenido: ["a", "b"],
          campanaSugerida: "c",
          precioSugerido: "p",
          riesgoPrincipal: "r",
        },
      },
    ]);
    expect(mockAbort).not.toHaveBeenCalled();

    const params = mockStream.mock.calls[0]?.[0];
    expect(params.model).toBe("claude-opus-4-8");
    expect(params.max_tokens).toBe(1600);
    expect(params.system).toContain(
      "Sos un estratega de marketing y comercio para una empresa argentina",
    );
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
    mockStream.mockReturnValue(flujo("{}"));

    await call({ producto: "zapatillas", ncm: null });

    const prompt = mockStream.mock.calls[0]?.[0].messages[0].content[0].text as string;
    expect(prompt).not.toContain("Posición NCM");
    expect(prompt).not.toContain("Resumen de costos");
    expect(prompt).not.toContain("Contexto adicional");
  });

  it("ANTHROPIC_MODEL_ANALYZE sobreescribe el modelo", async () => {
    vi.stubEnv("ANTHROPIC_MODEL_ANALYZE", "otro-modelo");
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockStream.mockReturnValue(flujo("{}"));

    await call({ producto: "x" });

    expect(mockStream.mock.calls[0]?.[0].model).toBe("otro-modelo");
  });

  it("la request a Anthropic lleva el signal de la request entrante (si el usuario se va, se corta)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockStream.mockReturnValue(flujo("{}"));

    await call({ producto: "x" });

    expect(mockStream.mock.calls[0]?.[1]?.signal).toBeInstanceOf(AbortSignal);
  });

  it("respuesta sin JSON: el error llega como último evento, dentro del 200", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockStream.mockReturnValue(flujo("no sé"));

    const res = await call({ producto: "x" });

    expect(res.status).toBe(200);
    expect((await eventos(res)).at(-1)).toEqual({
      tipo: "error",
      error: "El modelo no devolvió JSON válido.",
    });
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it("respuesta vacía (ningún fragmento de texto): 502, como el original", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockStream.mockReturnValue(flujo());

    const res = await call({ producto: "x" });

    expect(res.status).toBe(502);
    expect(await res.json()).toEqual({ error: "Respuesta vacía del modelo." });
  });

  it("si la IA falla al arrancar: 502 genérico sin detalle crudo (un solo intento, como el original)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockStream.mockReturnValue(
      flujo(
        APIError.generate(529, { error: { message: "detalle-crudo-xyz" } }, "x", new Headers()),
      ),
    );

    const res = await call({ producto: "x" });

    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("detalle-crudo-xyz");
    expect(mockStream).toHaveBeenCalledTimes(1);
    expect(mockCaptureException).toHaveBeenCalled();
  });

  it("si la IA falla a mitad: evento de error genérico sin detalle crudo, y se corta el stream", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockStream.mockReturnValue(
      flujo(
        '{"publicoObjetivo":"run',
        APIError.generate(529, { error: { message: "detalle-crudo-xyz" } }, "x", new Headers()),
      ),
    );

    const res = await call({ producto: "x" });
    const todos = await eventos(res);

    expect(res.status).toBe(200);
    expect(todos.at(-1)).toEqual({ tipo: "error", error: "Error de la API de Anthropic (529)." });
    expect(JSON.stringify(todos)).not.toContain("detalle-crudo-xyz");
    expect(mockAbort).toHaveBeenCalled();
  });

  it("sin API key: 500 de configuración antes de transmitir nada", async () => {
    vi.stubEnv("ANTHROPIC_API_KEY", "");
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

    const res = await call({ producto: "x" });

    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "Error de configuración del servidor." });
    expect(mockStream).not.toHaveBeenCalled();
  });
});
