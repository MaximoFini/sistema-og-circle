import { describe, expect, it } from "vitest";
import { compraFueConfirmada } from "./confirmacion";

describe("compraFueConfirmada", () => {
  it("no confirma mientras el nivel sigue en 'ninguno'", () => {
    expect(compraFueConfirmada("ninguno", "principiante")).toBe(false);
    expect(compraFueConfirmada("ninguno", null)).toBe(false);
  });

  it("sin nivel esperado (query param ausente/inválido), cualquier nivel distinto de 'ninguno' confirma", () => {
    expect(compraFueConfirmada("principiante", null)).toBe(true);
    expect(compraFueConfirmada("avanzado", null)).toBe(true);
  });

  it("confirma cuando el nivel alcanzado coincide con el esperado", () => {
    expect(compraFueConfirmada("principiante", "principiante")).toBe(true);
    expect(compraFueConfirmada("avanzado", "avanzado")).toBe(true);
  });

  // Bug de la auditoría de Mercado Pago: un usuario Principiante que compra
  // el upgrade a Avanzado YA tiene nivel !== 'ninguno' antes de que el
  // webhook confirme la compra nueva. La condición vieja (`nivel !==
  // "ninguno"`) daba esto por confirmado de inmediato, sin esperar nada.
  it("NO confirma un upgrade a avanzado mientras el nivel alcanzado sigue en principiante", () => {
    expect(compraFueConfirmada("principiante", "avanzado")).toBe(false);
  });

  it("confirma el upgrade recién cuando el nivel alcanzado llega a avanzado", () => {
    expect(compraFueConfirmada("avanzado", "avanzado")).toBe(true);
  });
});
