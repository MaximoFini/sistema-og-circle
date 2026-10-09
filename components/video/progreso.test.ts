import { describe, expect, it } from "vitest";
import { contarVistosFormacion, leerVideoInicial } from "./progreso";

const IDS = ["a", "b", "c"];

describe("contarVistosFormacion", () => {
  it("cuenta solo los vistos que siguen en la formación", () => {
    expect(contarVistosFormacion(new Set(["a", "c"]), IDS)).toBe(2);
  });

  it("ignora ids de stage 3, despublicados o borrados", () => {
    // 'x' = video de agentes, 'y' = despublicado: no deben inflar el contador.
    expect(contarVistosFormacion(new Set(["a", "x", "y"]), IDS)).toBe(1);
  });

  it("nunca supera el total, aunque haya más vistos que videos", () => {
    const vistos = new Set(["a", "b", "c", "x", "y", "z"]);
    expect(contarVistosFormacion(vistos, IDS)).toBe(3);
  });

  it("0 sin vistos o sin videos publicados", () => {
    expect(contarVistosFormacion(new Set(), IDS)).toBe(0);
    expect(contarVistosFormacion(new Set(["a"]), [])).toBe(0);
  });
});

describe("leerVideoInicial", () => {
  it("devuelve el video y limpia la URL cuando es de la formación", () => {
    expect(leerVideoInicial("?video=b", IDS)).toEqual({ videoInicial: "b", searchLimpia: "" });
  });

  it("un id inexistente da null pero igual limpia la URL (la página se ve normal)", () => {
    expect(leerVideoInicial("?video=zzz", IDS)).toEqual({ videoInicial: null, searchLimpia: "" });
  });

  it("un id vacío da null", () => {
    expect(leerVideoInicial("?video=", IDS)).toEqual({ videoInicial: null, searchLimpia: "" });
  });

  it("sin ?video no hay nada que hacer ni que limpiar", () => {
    expect(leerVideoInicial("", IDS)).toEqual({ videoInicial: null, searchLimpia: null });
    expect(leerVideoInicial("?otro=1", IDS)).toEqual({ videoInicial: null, searchLimpia: null });
  });

  it("conserva los demás parámetros al limpiar", () => {
    expect(leerVideoInicial("?utm=x&video=a&z=1", IDS)).toEqual({
      videoInicial: "a",
      searchLimpia: "?utm=x&z=1",
    });
  });

  it("sin videos publicados nunca abre nada", () => {
    expect(leerVideoInicial("?video=a", [])).toEqual({ videoInicial: null, searchLimpia: "" });
  });

  it("no hace match parcial ni distingue mayúsculas por accidente", () => {
    expect(leerVideoInicial("?video=A", IDS).videoInicial).toBeNull();
    expect(leerVideoInicial("?video=a%20", IDS).videoInicial).toBeNull();
  });
});
