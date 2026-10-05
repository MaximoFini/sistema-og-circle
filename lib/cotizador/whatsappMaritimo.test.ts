import { describe, expect, it } from "vitest";
import { calcAmbas } from "./calcMaritimo";
import { fmtUSD, PUERTOS } from "./tarifasMaritimo";
import { textoResumenMaritimo } from "./whatsappMaritimo";

// Caso "set de herramientas" del original, con el motor real: el texto tiene
// que mostrar los mismos números que la pantalla.
const entrada = {
  volumenM3: "8.501",
  pesoKg: "5500",
  fob: "18000",
  unidades: "1",
  die: 18,
  te: 3,
  iva: 21,
  tc: 1000,
};

const base = {
  refNumber: "MAR-123456",
  producto: "Set de herramientas & accesorios",
  fiscal: { sim: "8206.00.00.900", descripcion: "", die: 18, te: 3, iva: 21 },
  puerto: PUERTOS[0],
  whatsappContacto: "https://wa.me/5491112345678",
};

describe("textoResumenMaritimo", () => {
  it("lleva referencia, producto, SIM, carga y los totales de las dos opciones", () => {
    const res = calcAmbas(entrada);
    const texto = textoResumenMaritimo({ ...base, res });

    expect(texto).toContain("*OG Circle — Cotización marítima MAR-123456*");
    expect(texto).toContain("Producto: Set de herramientas & accesorios");
    expect(texto).toContain("Posición SIM: 8206.00.00.900");
    expect(texto).toContain(`${PUERTOS[0]?.label} → Buenos Aires`);
    expect(texto).toContain(fmtUSD(res.consolidado.totales.costos));
    expect(texto).toContain(fmtUSD(res.consolidado.totales.aPagar));
    expect(texto).toContain(fmtUSD(res.full.totales.costos));
    expect(texto).toContain(fmtUSD(res.full.totales.aPagar));
    expect(texto).toContain(res.contenedor.label);
    expect(texto.endsWith("OG Circle · https://wa.me/5491112345678")).toBe(true);
    expect(texto).not.toMatch(/vegroup/i);
  });

  it("marca el full como estimado sólo si no hay tarifa firme", () => {
    const estimado = textoResumenMaritimo({ ...base, res: calcAmbas(entrada) });
    expect(estimado).toContain("a pagar (estimado)");

    const firme = textoResumenMaritimo({
      ...base,
      res: calcAmbas({ ...entrada, fleteFullUsd: "3500" }),
    });
    expect(firme).not.toContain("(estimado)");
  });

  it("omite las líneas vacías (sin producto, sin SIM, sin puerto)", () => {
    const texto = textoResumenMaritimo({
      ...base,
      producto: "  ",
      fiscal: { ...base.fiscal, sim: "" },
      puerto: undefined,
      res: calcAmbas(entrada),
    });
    expect(texto).not.toContain("Producto:");
    expect(texto).not.toContain("Posición SIM:");
    expect(texto).not.toContain("→ Buenos Aires");
  });

  it("encodeURIComponent deja bien los acentos, el & y los saltos de línea", () => {
    const texto = textoResumenMaritimo({ ...base, res: calcAmbas(entrada) });
    const url = `https://wa.me/?text=${encodeURIComponent(texto)}`;
    expect(new URL(url).searchParams.get("text")).toBe(texto);
  });
});
