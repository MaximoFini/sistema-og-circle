// VGRP-57 — tests unitarios de POST /api/cotizador/extraer-documento. Mismo
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
const MB = 1024 * 1024;
const base64DeBytes = (n: number) => Buffer.alloc(n, 7).toString("base64");
const PNG_CHICO = base64DeBytes(1000);

async function call(body: unknown) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/cotizador/extraer-documento", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

const texto = (t: string) => ({ content: [{ type: "text", text: t }] });

describe("POST /api/cotizador/extraer-documento", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockCreate.mockReset();
    mockCaptureException.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "clave-de-prueba-no-real");
    vi.stubEnv("ANTHROPIC_MODEL_EXTRACT", "");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("sin sesión: 401 y no llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);

    const res = await call({ fileBase64: PNG_CHICO, mediaType: "image/png" });

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno': 403 y NO llama a Anthropic (ni con un archivo enorme: el guard va antes)", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const res = await call({ fileBase64: base64DeBytes(4 * MB), mediaType: "image/png" });

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    [{ mediaType: "image/png" }, 'Enviá "fileBase64" y "mediaType".'],
    [{ fileBase64: PNG_CHICO }, 'Enviá "fileBase64" y "mediaType".'],
    [
      { fileBase64: PNG_CHICO, mediaType: "text/plain" },
      "Formato no soportado. Usá una imagen (JPG, PNG, WebP o GIF) o un PDF.",
    ],
    [
      { fileBase64: PNG_CHICO, mediaType: "image/bmp" },
      "Formato no soportado. Usá una imagen (JPG, PNG, WebP o GIF) o un PDF.",
    ],
  ])("entrada inválida %j: 400", async (body, mensaje) => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

    const res = await call(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: mensaje });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("archivo decodificado > 3 MB: 413 y no llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

    const res = await call({ fileBase64: base64DeBytes(3 * MB + 1), mediaType: "application/pdf" });

    expect(res.status).toBe(413);
    expect(await res.json()).toEqual({ error: expect.stringContaining("3 MB") });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("exactamente 3 MB decodificados: pasa (el límite es sobre el archivo, no sobre el base64)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(texto("{}"));

    const res = await call({ fileBase64: base64DeBytes(3 * MB), mediaType: "application/pdf" });

    expect(res.status).toBe(200);
  });

  it("imagen con plan: 200, bloque image + instrucción del original, y dimensiones normalizadas", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(
      texto('{"producto":"zapatillas","fob":1200.5,"dimensiones":null}'),
    );

    const res = await call({ fileBase64: PNG_CHICO, mediaType: "image/png", filename: "p.png" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      producto: "zapatillas",
      fob: 1200.5,
      dimensiones: { largo: null, ancho: null, alto: null },
    });

    const params = mockCreate.mock.calls[0]?.[0];
    expect(params.model).toBe("claude-sonnet-5");
    expect(params.max_tokens).toBe(1200);
    expect(params.system).toContain("Extraés datos de proformas y packing lists de importación.");
    expect(params).not.toHaveProperty("tools");
    const [doc, instr] = params.messages[0].content;
    expect(doc).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/png", data: PNG_CHICO },
    });
    expect(instr.type).toBe("text");
    expect(instr.text).toContain(
      "Leé este documento de importación (proforma / packing list) y extraé los datos.",
    );
    expect(instr.text).toContain('"direccionFabricante"');
  });

  it("PDF: manda un bloque document", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(texto('{"dimensiones":{"largo":10,"ancho":20,"alto":30}}'));

    const res = await call({ fileBase64: PNG_CHICO, mediaType: "application/pdf" });

    expect(await res.json()).toEqual({ dimensiones: { largo: 10, ancho: 20, alto: 30 } });
    expect(mockCreate.mock.calls[0]?.[0].messages[0].content[0]).toEqual({
      type: "document",
      source: { type: "base64", media_type: "application/pdf", data: PNG_CHICO },
    });
  });

  it("ANTHROPIC_MODEL_EXTRACT sobreescribe el modelo", async () => {
    vi.stubEnv("ANTHROPIC_MODEL_EXTRACT", "otro-modelo");
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(texto("{}"));

    await call({ fileBase64: PNG_CHICO, mediaType: "image/webp" });

    expect(mockCreate.mock.calls[0]?.[0].model).toBe("otro-modelo");
  });

  it("si la IA falla: 502 genérico sin detalle crudo", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockRejectedValue(
      APIError.generate(400, { error: { message: "detalle-crudo-xyz" } }, "x", new Headers()),
    );

    const res = await call({ fileBase64: PNG_CHICO, mediaType: "image/jpeg" });

    expect(res.status).toBe(502);
    expect(JSON.stringify(await res.json())).not.toContain("detalle-crudo-xyz");
    expect(mockCaptureException).toHaveBeenCalled();
  });
});
