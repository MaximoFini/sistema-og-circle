// VGRP-70 — tests de POST /api/cotizador/identificar-producto. Mismo esquema
// de mocks que extraer-documento/route.test.ts: sesión y SDK mockeados, sin
// red ni clave real.

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
const JPG_CHICO = base64DeBytes(1000);

const toolUse = (input: unknown) => ({
  content: [{ type: "tool_use", id: "t1", name: "emitir_resultado", input }],
});

async function call(body: unknown) {
  const { POST } = await import("./route");
  return POST(
    new Request("http://localhost/api/cotizador/identificar-producto", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );
}

describe("POST /api/cotizador/identificar-producto", () => {
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

    const res = await call({ fileBase64: JPG_CHICO, mediaType: "image/jpeg" });

    expect(res.status).toBe(401);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno': 403 y NO llama a Anthropic (ni con una foto enorme: el guard va antes)", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const res = await call({ fileBase64: base64DeBytes(4 * MB), mediaType: "image/jpeg" });

    expect(res.status).toBe(403);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it.each([
    [{ mediaType: "image/jpeg" }, 'Enviá "fileBase64" y "mediaType".'],
    [{ fileBase64: JPG_CHICO }, 'Enviá "fileBase64" y "mediaType".'],
    [
      { fileBase64: JPG_CHICO, mediaType: "application/pdf" },
      "Formato no soportado. Usá una foto JPG, PNG o WebP.",
    ],
    [
      { fileBase64: JPG_CHICO, mediaType: "image/gif" },
      "Formato no soportado. Usá una foto JPG, PNG o WebP.",
    ],
  ])("entrada inválida %j: 400", async (body, mensaje) => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

    const res = await call(body);

    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: mensaje });
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("foto decodificada > 3 MB: 413 y no llama a Anthropic", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);

    const res = await call({ fileBase64: base64DeBytes(3 * MB + 1), mediaType: "image/jpeg" });

    expect(res.status).toBe(413);
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("ok: 200 con la descripción; al SDK le llega la imagen, el schema y el modelo de extracción", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(
      toolUse({
        producto: " taladro percutor eléctrico ",
        detalle: "Herramienta eléctrica manual, 750 W, con mandril.",
        confianza: 88,
        dudas: "",
      }),
    );

    const res = await call({ fileBase64: JPG_CHICO, mediaType: "image/jpeg" });

    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({
      producto: "taladro percutor eléctrico",
      detalle: "Herramienta eléctrica manual, 750 W, con mandril.",
      confianza: 88,
      dudas: "",
    });
    const params = mockCreate.mock.calls[0]?.[0];
    expect(params.model).toBe("claude-sonnet-5");
    expect(params.thinking).toEqual({ type: "disabled" });
    expect(params.messages[0].content[0]).toEqual({
      type: "image",
      source: { type: "base64", media_type: "image/jpeg", data: JPG_CHICO },
    });
    expect(params.tools[0].input_schema.required).toEqual([
      "producto",
      "detalle",
      "confianza",
      "dudas",
    ]);
    expect(params.system).toContain("no inventás un producto");
  });

  it("ANTHROPIC_MODEL_EXTRACT sobreescribe el modelo", async () => {
    vi.stubEnv("ANTHROPIC_MODEL_EXTRACT", "modelo-de-prueba");
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(toolUse({ producto: "x", detalle: "", confianza: 50, dudas: "" }));

    await call({ fileBase64: JPG_CHICO, mediaType: "image/png" });

    expect(mockCreate.mock.calls[0]?.[0].model).toBe("modelo-de-prueba");
  });

  it("normaliza lo que devuelve el modelo: confianza acotada y redondeada, strings faltantes vacíos", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockResolvedValue(toolUse({ producto: "paisaje", confianza: 140.6 }));

    const res = await call({ fileBase64: JPG_CHICO, mediaType: "image/webp" });

    expect(await res.json()).toEqual({
      producto: "paisaje",
      detalle: "",
      confianza: 100,
      dudas: "",
    });
  });

  it("si la IA falla (3 intentos): 502 genérico, sin el detalle crudo", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CON_PLAN);
    mockCreate.mockRejectedValue(
      APIError.generate(529, { error: { message: "detalle crudo interno" } }, "x", new Headers()),
    );

    const res = await call({ fileBase64: JPG_CHICO, mediaType: "image/jpeg" });

    expect(res.status).toBe(502);
    const cuerpo = await res.json();
    expect(JSON.stringify(cuerpo)).not.toContain("detalle crudo interno");
    expect(mockCreate).toHaveBeenCalledTimes(3);
  });
});
