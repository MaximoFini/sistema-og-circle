import { describe, expect, it } from "vitest";
import { mapearEstadoMercadoPago } from "./mapEstado";

describe("mapearEstadoMercadoPago", () => {
  it.each([
    ["approved", "approved"],
    ["pending", "pending"],
    ["in_process", "pending"],
    ["authorized", "pending"],
    ["rejected", "rejected"],
    ["cancelled", "rejected"],
    ["refunded", "refunded"],
    ["charged_back", "refunded"],
  ] as const)("mapea status='%s' -> estado='%s'", (status, esperado) => {
    expect(mapearEstadoMercadoPago(status)).toBe(esperado);
  });

  it("devuelve null ante un status desconocido (no inventa un estado)", () => {
    expect(mapearEstadoMercadoPago("un_status_que_no_existe")).toBeNull();
  });
});
