import { describe, expect, it } from "vitest";
import { parsearJSONParcial } from "./jsonParcial";

describe("parsearJSONParcial", () => {
  it("sin `{` todavía: undefined", () => {
    expect(parsearJSONParcial("")).toBeUndefined();
    expect(parsearJSONParcial("```json\n")).toBeUndefined();
  });

  it("JSON completo, con fence antes y después", () => {
    expect(parsearJSONParcial('```json\n{"a":"x","b":["1","2"]}\n```')).toEqual({
      a: "x",
      b: ["1", "2"],
    });
  });

  it("corte dentro de un valor string: lo muestra a medias", () => {
    expect(parsearJSONParcial('{"publicoObjetivo": "Jóvenes de 18')).toEqual({
      publicoObjetivo: "Jóvenes de 18",
    });
  });

  it("corte dentro de un string de un array", () => {
    expect(parsearJSONParcial('{"a": "x", "angulosVenta": ["uno", "do')).toEqual({
      a: "x",
      angulosVenta: ["uno", "do"],
    });
  });

  it.each([
    ['{"a": "x", "angu', "clave a medias"],
    ['{"a": "x", "angulosVenta"', "clave sin `:`"],
    ['{"a": "x", "angulosVenta":', "clave con `:` y sin valor"],
    ['{"a": "x", "angulosVenta": ', "clave con `:` y espacio"],
    ['{"a": "x",', "coma colgando"],
  ])("%s (%s): descarta lo incompleto", (texto) => {
    expect(parsearJSONParcial(texto)).toEqual({ a: "x" });
  });

  it("array recién abierto: vacío", () => {
    expect(parsearJSONParcial('{"a": "x", "b": [')).toEqual({ a: "x", b: [] });
  });

  it("escape a medias al final del string", () => {
    expect(parsearJSONParcial('{"a": "dijo \\')).toEqual({ a: "dijo " });
    expect(parsearJSONParcial('{"a": "x\\u00')).toEqual({ a: "x" });
  });

  it("comillas y llaves escapadas dentro de strings no confunden el cierre", () => {
    expect(parsearJSONParcial('{"a": "un \\"}\\" raro", "b": "y')).toEqual({
      a: 'un "}" raro',
      b: "y",
    });
  });

  it("número o literal a medias: se descarta hasta el próximo valor completo", () => {
    expect(parsearJSONParcial('{"a": "x", "n": 12.')).toEqual({ a: "x", n: 12 });
    expect(parsearJSONParcial('{"a": "x", "ok": tr')).toEqual({ a: "x" });
  });

  it("texto roto a mitad, no sólo cortado: se rinde (undefined) en vez de recortar sin fin", () => {
    const roto = `{"a": "x" ??? ${'"relleno", '.repeat(50)}"b": "y`;
    expect(parsearJSONParcial(roto)).toBeUndefined();
  });
});
