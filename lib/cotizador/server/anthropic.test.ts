// VGRP-57 — tests unitarios del cliente de Anthropic de la calculadora. El SDK
// está mockeado (sólo el constructor del cliente: las clases de error son las
// REALES, porque el código las distingue con `instanceof`). Sin red y sin
// ANTHROPIC_API_KEY real.

import { APIConnectionError, APIError } from "@anthropic-ai/sdk";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCreate = vi.fn();
const mockConstructor = vi.fn();

vi.mock("@anthropic-ai/sdk", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@anthropic-ai/sdk")>();
  class FakeAnthropic {
    messages = { create: (...args: unknown[]) => mockCreate(...args) };
    constructor(opts: unknown) {
      mockConstructor(opts);
    }
  }
  return { ...actual, default: FakeAnthropic };
});

const toolUse = (input: unknown) => ({
  content: [{ type: "tool_use", id: "t1", name: "emitir_resultado", input }],
});
const errorApi = (status: number) =>
  APIError.generate(status, { error: { message: "detalle crudo interno" } }, "x", new Headers());

async function cargar() {
  return import("./anthropic");
}

describe("lib/cotizador/server/anthropic", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCreate.mockReset();
    mockConstructor.mockReset();
    vi.stubEnv("ANTHROPIC_API_KEY", "clave-de-prueba-no-real");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  describe("llamarJSON", () => {
    it("fuerza la tool `emitir_resultado` y devuelve el input del bloque tool_use", async () => {
      mockCreate.mockResolvedValue(toolUse({ a: 1 }));
      const { llamarJSON } = await cargar();

      const out = await llamarJSON({
        model: "m",
        max_tokens: 10,
        system: "sys",
        content: [{ type: "text", text: "hola" }],
        schema: { type: "object", properties: { a: { type: "integer" } } },
      });

      expect(out).toEqual({ a: 1 });
      expect(mockCreate).toHaveBeenCalledWith({
        model: "m",
        max_tokens: 10,
        // B12-09: sin thinking, para que no se coma el max_tokens.
        thinking: { type: "disabled" },
        system: "sys",
        messages: [{ role: "user", content: [{ type: "text", text: "hola" }] }],
        tools: [
          {
            name: "emitir_resultado",
            description: "Emite el resultado estructurado pedido en la consigna.",
            input_schema: { type: "object", properties: { a: { type: "integer" } } },
          },
        ],
        tool_choice: { type: "tool", name: "emitir_resultado" },
      });
    });

    it("el cliente del SDK se arma con maxRetries: 0 (los reintentos son los del original, no se multiplican)", async () => {
      mockCreate.mockResolvedValue(toolUse({}));
      const { llamarJSON } = await cargar();

      await llamarJSON({ model: "m", max_tokens: 1, content: [] });

      expect(mockConstructor).toHaveBeenCalledWith({
        apiKey: "clave-de-prueba-no-real",
        maxRetries: 0,
      });
    });

    it("sin `system` no manda la clave (como el original)", async () => {
      mockCreate.mockResolvedValue(toolUse({}));
      const { llamarJSON } = await cargar();

      await llamarJSON({ model: "m", max_tokens: 1, content: [] });

      expect(mockCreate.mock.calls[0]?.[0]).not.toHaveProperty("system");
    });

    it("reintenta hasta 3 veces ante errores de la API y después tira 502 SIN el detalle crudo", async () => {
      mockCreate.mockRejectedValue(errorApi(529));
      const { llamarJSON, ErrorCotizador } = await cargar();

      const err = await llamarJSON({ model: "m", max_tokens: 1, content: [] }).catch((e) => e);

      expect(mockCreate).toHaveBeenCalledTimes(3);
      expect(err).toBeInstanceOf(ErrorCotizador);
      expect(err.status).toBe(502);
      expect(err.message).not.toContain("detalle crudo interno");
    });

    it("se recupera si un intento intermedio sale bien", async () => {
      mockCreate
        .mockRejectedValueOnce(errorApi(500))
        .mockResolvedValueOnce({ content: [{ type: "text", text: "sin tool" }] })
        .mockResolvedValueOnce(toolUse({ ok: true }));
      const { llamarJSON } = await cargar();

      await expect(llamarJSON({ model: "m", max_tokens: 1, content: [] })).resolves.toEqual({
        ok: true,
      });
      expect(mockCreate).toHaveBeenCalledTimes(3);
    });

    it("clave inválida (401): 500 de config y NO reintenta", async () => {
      mockCreate.mockRejectedValue(errorApi(401));
      const { llamarJSON } = await cargar();

      const err = await llamarJSON({ model: "m", max_tokens: 1, content: [] }).catch((e) => e);

      expect(err.status).toBe(500);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });

    it("sin ANTHROPIC_API_KEY: 500 de config, sin llamar al SDK", async () => {
      vi.stubEnv("ANTHROPIC_API_KEY", "");
      const { llamarJSON } = await cargar();

      const err = await llamarJSON({ model: "m", max_tokens: 1, content: [] }).catch((e) => e);

      expect(err.status).toBe(500);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("falla de red (APIConnectionError): 502", async () => {
      mockCreate.mockRejectedValue(new APIConnectionError({ message: "ECONNRESET" }));
      const { llamarJSON } = await cargar();

      const err = await llamarJSON({ model: "m", max_tokens: 1, content: [] }).catch((e) => e);

      expect(err.status).toBe(502);
    });
  });

  describe("llamarTexto", () => {
    it("concatena los bloques de texto; sin reintentos", async () => {
      mockCreate.mockResolvedValue({
        content: [
          { type: "text", text: " uno " },
          { type: "text", text: "dos" },
        ],
      });
      const { llamarTexto } = await cargar();

      await expect(llamarTexto({ model: "m", max_tokens: 1, content: [] })).resolves.toBe(
        "uno \ndos",
      );
      expect(mockCreate.mock.calls[0]?.[0]).not.toHaveProperty("tools");
    });

    it("respuesta vacía: 502", async () => {
      mockCreate.mockResolvedValue({ content: [] });
      const { llamarTexto } = await cargar();

      const err = await llamarTexto({ model: "m", max_tokens: 1, content: [] }).catch((e) => e);

      expect(err.status).toBe(502);
      expect(err.message).toBe("Respuesta vacía del modelo.");
    });

    it("error de la API: 502 al primer intento", async () => {
      mockCreate.mockRejectedValue(errorApi(529));
      const { llamarTexto } = await cargar();

      const err = await llamarTexto({ model: "m", max_tokens: 1, content: [] }).catch((e) => e);

      expect(err.status).toBe(502);
      expect(mockCreate).toHaveBeenCalledTimes(1);
    });
  });

  describe("extraerJSON (literal del original)", () => {
    it.each([
      ['{"a":1}', { a: 1 }],
      ['```json\n{"a":1}\n```', { a: 1 }],
      ['Acá va: {"a":{"b":2}} listo', { a: { b: 2 } }],
    ])("%s", async (texto, esperado) => {
      const { extraerJSON } = await cargar();
      expect(extraerJSON(texto)).toEqual(esperado);
    });

    it("sin JSON: 502", async () => {
      const { extraerJSON } = await cargar();
      expect(() => extraerJSON("nada por acá")).toThrow("El modelo no devolvió JSON válido.");
    });
  });
});
