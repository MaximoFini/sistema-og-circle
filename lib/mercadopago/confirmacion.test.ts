import { describe, expect, it } from "vitest";
import { compraFueConfirmada } from "./confirmacion";

describe("compraFueConfirmada", () => {
  it("no confirma mientras el nivel sigue en 'ninguno'", () => {
    expect(compraFueConfirmada("ninguno", "completo")).toBe(false);
    expect(compraFueConfirmada("ninguno", null)).toBe(false);
  });

  it("sin nivel esperado (query param ausente/inválido), cualquier nivel distinto de 'ninguno' confirma", () => {
    expect(compraFueConfirmada("completo", null)).toBe(true);
  });

  it("confirma cuando el nivel alcanzado llega al esperado", () => {
    expect(compraFueConfirmada("completo", "completo")).toBe(true);
  });
});
