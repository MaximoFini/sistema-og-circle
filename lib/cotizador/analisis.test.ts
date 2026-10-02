import { describe, expect, it } from "vitest";
import { normalizarAnalisis } from "./analisis";

describe("normalizarAnalisis", () => {
  it("arrays: string suelto → [string], y se descartan vacíos y no-strings", () => {
    expect(
      normalizarAnalisis({ angulosVenta: " precio ", ideasContenido: ["a", "", null, 3, "b"] }),
    ).toMatchObject({ angulosVenta: ["precio"], ideasContenido: ["a", "b"] });
  });

  it("textos: sólo strings no vacíos", () => {
    const r = normalizarAnalisis({
      publicoObjetivo: "  ",
      campanaSugerida: 5,
      precioSugerido: "p",
    });
    expect(r.publicoObjetivo).toBeUndefined();
    expect(r.campanaSugerida).toBeUndefined();
    expect(r.precioSugerido).toBe("p");
  });

  it.each([undefined, null, "texto", ["a"]])("%j no es un objeto: análisis vacío", (v) => {
    expect(normalizarAnalisis(v)).toEqual({ angulosVenta: [], ideasContenido: [] });
  });

  it("descarta campos que no son del análisis", () => {
    expect(normalizarAnalisis({ otro: "x" })).not.toHaveProperty("otro");
  });
});
