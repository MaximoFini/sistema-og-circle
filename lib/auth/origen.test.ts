import { describe, expect, it } from "vitest";
import { normalizarOrigen, ORIGENES } from "./origen";

describe("normalizarOrigen", () => {
  it.each(ORIGENES)("acepta el valor de la lista cerrada '%s' tal cual", (origen) => {
    expect(normalizarOrigen(origen)).toBe(origen);
  });

  it.each([undefined, null, "", "   "])("vacío (%j) → 'directo'", (valor) => {
    expect(normalizarOrigen(valor)).toBe("directo");
  });

  it.each(["cualquiercosa", "LANDING-NAV", "landing-nav-x", "<script>"])(
    "desconocido (%s) → 'otro', nunca texto libre",
    (valor) => {
      expect(normalizarOrigen(valor)).toBe("otro");
    },
  );

  it("recorta espacios alrededor de un valor válido", () => {
    expect(normalizarOrigen(" landing-hero ")).toBe("landing-hero");
  });
});
