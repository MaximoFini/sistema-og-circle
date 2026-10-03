// VGRP-57 — lib/cotizador/api.ts: lo único que no es copia del original es el
// transporte (endpoints nuevos, sin token) y la salida a /login o /comprar
// cuando la sesión o el plan se pierden con la página abierta.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  analyzeProduct,
  DESTINO_SIN_PLAN,
  DESTINO_SIN_SESION,
  ErrorApi,
  getDolarBNA,
  identifyNCM,
} from "./api";

const assign = vi.fn();
const fetchMock = vi.fn();

function respuesta(status: number, body: unknown): Response {
  return new Response(body === undefined ? "sin json" : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  vi.stubGlobal("window", { location: { assign } });
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

describe("post a /api/cotizador/*", () => {
  it("manda JSON por POST al endpoint nuevo, sin header de autorización", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { venta: 1000 }));
    await expect(getDolarBNA()).resolves.toEqual({ venta: 1000 });

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/cotizador/dolar");
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({ "content-type": "application/json" });
    expect(JSON.parse(String(init.body))).toEqual({});
  });

  it("identifyNCM manda { query, candidates } tal cual", async () => {
    fetchMock.mockResolvedValue(respuesta(200, { ncm: "1", confianza: 90 }));
    await identifyNCM("zapas", [{ ncm: "6404.11.00.000X", descripcion: "Calzado" }]);

    const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit];
    expect(url).toBe("/api/cotizador/identificar-ncm");
    expect(JSON.parse(String(init.body))).toEqual({
      query: "zapas",
      candidates: [{ ncm: "6404.11.00.000X", descripcion: "Calzado" }],
    });
  });

  it("un error lanza ErrorApi con el `error` del JSON y el status", async () => {
    fetchMock.mockResolvedValue(respuesta(502, { error: "La IA no respondió." }));
    const err = await analyzeProduct({ producto: "x" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ErrorApi);
    expect((err as ErrorApi).message).toBe("La IA no respondió.");
    expect((err as ErrorApi).status).toBe(502);
    expect(assign).not.toHaveBeenCalled();
  });

  it("sin JSON en el error: mensaje genérico con status y ruta (como el original)", async () => {
    fetchMock.mockResolvedValue(respuesta(500, undefined));
    await expect(getDolarBNA()).rejects.toThrow("Error 500 al llamar a /api/cotizador/dolar.");
  });

  it("sin red: ErrorApi sin status y el mensaje del original", async () => {
    fetchMock.mockRejectedValue(new TypeError("Failed to fetch"));
    const err = await getDolarBNA().catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ErrorApi);
    expect((err as ErrorApi).status).toBeUndefined();
    expect((err as ErrorApi).message).toMatch(/No se pudo contactar al servidor de IA/);
  });

  it("401 (sesión vencida): manda a /login?next=/calculadora y lanza igual", async () => {
    fetchMock.mockResolvedValue(respuesta(401, { error: "No autenticado." }));
    await expect(getDolarBNA()).rejects.toMatchObject({ status: 401 });
    expect(assign).toHaveBeenCalledWith(DESTINO_SIN_SESION);
    expect(DESTINO_SIN_SESION).toBe("/login?next=/calculadora");
  });

  it("403 (sin plan): manda a /comprar y lanza igual", async () => {
    fetchMock.mockResolvedValue(respuesta(403, { error: "Necesitás un plan." }));
    await expect(getDolarBNA()).rejects.toMatchObject({ status: 403 });
    expect(assign).toHaveBeenCalledWith(DESTINO_SIN_PLAN);
    expect(DESTINO_SIN_PLAN).toBe("/comprar");
  });
});

describe("analyzeProduct (streaming NDJSON)", () => {
  /** Respuesta 200 que entrega el cuerpo en los trozos de red indicados. */
  function ndjson(...trozos: string[]): Response {
    const codificador = new TextEncoder();
    return new Response(
      new ReadableStream({
        start(controller) {
          for (const t of trozos) controller.enqueue(codificador.encode(t));
          controller.close();
        },
      }),
      { status: 200, headers: { "content-type": "application/x-ndjson" } },
    );
  }
  const linea = (evento: unknown) => `${JSON.stringify(evento)}\n`;

  it("va avisando el análisis parcial y resuelve con el `fin` del servidor", async () => {
    const definitivo = { publicoObjetivo: "runners", angulosVenta: ["a"], ideasContenido: [] };
    // La segunda línea llega partida en dos trozos de red.
    const segunda = linea({ tipo: "texto", texto: ' 18", "angulosVenta": ["a' });
    fetchMock.mockResolvedValue(
      ndjson(
        linea({ tipo: "texto", texto: '{"publicoObjetivo": "Jóvenes de' }),
        segunda.slice(0, 10),
        segunda.slice(10),
        linea({ tipo: "fin", analisis: definitivo }),
      ),
    );
    const onParcial = vi.fn();

    await expect(analyzeProduct({ producto: "x" }, { onParcial })).resolves.toEqual(definitivo);

    expect(onParcial).toHaveBeenCalledTimes(2);
    expect(onParcial).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({ publicoObjetivo: "Jóvenes de" }),
    );
    expect(onParcial).toHaveBeenLastCalledWith(
      expect.objectContaining({ publicoObjetivo: "Jóvenes de 18", angulosVenta: ["a"] }),
    );
  });

  it("un evento `error` lanza ErrorApi con su mensaje", async () => {
    fetchMock.mockResolvedValue(
      ndjson(
        linea({ tipo: "texto", texto: "{" }),
        linea({ tipo: "error", error: "JSON inválido." }),
      ),
    );
    const err = await analyzeProduct({ producto: "x" }).catch((e: unknown) => e);

    expect(err).toBeInstanceOf(ErrorApi);
    expect((err as ErrorApi).message).toBe("JSON inválido.");
  });

  it("si el stream termina sin `fin` ni `error`: ErrorApi de conexión cortada", async () => {
    fetchMock.mockResolvedValue(ndjson(linea({ tipo: "texto", texto: "{" })));
    await expect(analyzeProduct({ producto: "x" })).rejects.toThrow(/Se cortó la conexión/);
  });

  it("cancelado con signal: rechaza con el AbortError, no con ErrorApi", async () => {
    const control = new AbortController();
    control.abort();
    fetchMock.mockRejectedValue(new DOMException("aborted", "AbortError"));

    const err = await analyzeProduct({ producto: "x" }, { signal: control.signal }).catch(
      (e: unknown) => e,
    );

    expect(err).not.toBeInstanceOf(ErrorApi);
    expect((err as DOMException).name).toBe("AbortError");
    expect((fetchMock.mock.calls[0] as [string, RequestInit])[1].signal).toBe(control.signal);
  });
});
