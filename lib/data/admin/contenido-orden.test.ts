// Unit test puro de asignarOrden (sin base): el reparto de "lugares" al
// reordenar videos, sea el listado completo del panel o un solo stage.

import { describe, expect, it } from "vitest";
import { asignarOrden } from "./contenido";

describe("asignarOrden", () => {
  it("reordena dentro de los mismos lugares", () => {
    const r = asignarOrden(["c", "a", "b"], [0, 1, 2]);
    expect([...r]).toEqual([
      ["c", 0],
      ["a", 1],
      ["b", 2],
    ]);
  });

  it("un subconjunto conserva los lugares que ya ocupaba (no pisa a otro stage)", () => {
    // stage 2 ocupaba 5 y 9; se invierten, siguen usando 5 y 9
    const r = asignarOrden(["y", "x"], [9, 5]);
    expect(r.get("y")).toBe(5);
    expect(r.get("x")).toBe(9);
  });

  it("desempata valores repetidos: el orden dentro del grupo queda estricto", () => {
    const r = asignarOrden(["b", "a"], [1, 1]);
    expect(r.get("b")).toBe(1);
    expect(r.get("a")).toBe(2);
  });
});
