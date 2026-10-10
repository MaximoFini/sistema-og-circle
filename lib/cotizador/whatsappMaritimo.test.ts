import { describe, expect, it } from "vitest";
import { calcAmbas } from "./calcMaritimo";
import { fmtUSD, PUERTOS } from "./tarifasMaritimo";
import { textoResumenMaritimo } from "./whatsappMaritimo";
import { linkWhatsappVegroup } from "./whatsappVegroup";

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
};

describe("textoResumenMaritimo", () => {
  it("dice qué se cotizó: servicio, producto, SIM con alícuotas, ruta y carga", () => {
    const res = calcAmbas(entrada);
    const texto = textoResumenMaritimo({ ...base, res });

    expect(texto).toContain("importación marítima");
    expect(texto).toContain("*Cotización N° MAR-123456*");
    expect(texto).toContain("Producto: Set de herramientas & accesorios");
    expect(texto).toContain(
      "Posición arancelaria (SIM): 8206.00.00.900 — DIE 18% · TE 3% · IVA 21%",
    );
    expect(texto).toContain(`${PUERTOS[0]?.label}`);
    expect(texto).toContain("→ Buenos Aires");
    expect(texto).toContain("Volumen:");
    expect(texto).toContain(`FOB): ${fmtUSD(18000)}`);
  });

  it("lleva costo real y total a pagar de las dos opciones", () => {
    const res = calcAmbas(entrada);
    const texto = textoResumenMaritimo({ ...base, res });

    expect(texto).toContain(`costo real ${fmtUSD(res.consolidado.totales.costos)}`);
    expect(texto).toContain(`total a pagar ${fmtUSD(res.consolidado.totales.aPagar)}`);
    expect(texto).toContain(`costo real ${fmtUSD(res.full.totales.costos)}`);
    expect(texto).toContain(`total a pagar ${fmtUSD(res.full.totales.aPagar)}`);
    expect(texto).toContain(res.contenedor.label);
    expect(texto).not.toMatch(/vegroup/i);
  });

  it("marca el full como estimado sólo si no hay tarifa firme", () => {
    const estimado = textoResumenMaritimo({ ...base, res: calcAmbas(entrada) });
    expect(estimado).toContain("(estimado:");

    const firme = textoResumenMaritimo({
      ...base,
      res: calcAmbas({ ...entrada, fleteFullUsd: "3500" }),
    });
    expect(firme).not.toContain("(estimado");
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
    expect(texto).not.toContain("Posición arancelaria");
    expect(texto).not.toContain("Ruta:");
  });

  it("el link va al número de VEGROUP y deja bien los acentos, el & y los saltos de línea", () => {
    const texto = textoResumenMaritimo({ ...base, res: calcAmbas(entrada) });
    const url = new URL(linkWhatsappVegroup(texto));
    expect(url.origin + url.pathname).toBe("https://wa.me/5491176392303");
    expect(url.searchParams.get("text")).toBe(texto);
  });
});
