import { describe, expect, it } from "vitest";
import { calcAllIntegral, calcAllRoutes, costoRealPorKg, fmtARS, fmtUSD } from "./calc";
import type { PosicionElegida } from "./types";
import { textoCourier, textoIntegral } from "./whatsappCourier";
import { linkWhatsappVegroup, WHATSAPP_VEGROUP, WHATSAPP_VEGROUP_LEGIBLE } from "./whatsappVegroup";

// El caso del QA manual: auriculares, FOB 300, 3 kg, 2 u., caja de 30×20×15, Miami.
const entrada = {
  pesoKg: "3",
  cajas: 1,
  largo: "30",
  ancho: "20",
  alto: "15",
  unidades: "2",
  dolarBN: "1535",
  dolarCCL: "1606.6",
};

const posicion: PosicionElegida = {
  sim: "8518.30.00.900M",
  descripcion: "Auriculares",
  die: 20,
  te: 3,
  iva: 21,
  impInternos: "",
} as PosicionElegida;

const form = {
  fob: "300",
  pesoKg: "3",
  unidades: "2",
  cajas: 1,
  largo: "30",
  ancho: "20",
  alto: "15",
};

const rutas = calcAllRoutes({ ...entrada, fob: "300", die: 20, te: 3, iva: 21 });
const miami = rutas.results.find((r) => r.route === "miami");
if (!miami) throw new Error("falta la ruta miami");

describe("textoCourier", () => {
  const texto = textoCourier({
    refNumber: "OG-20261010-1554",
    regimen: "general",
    producto: "auriculares bluetooth",
    selected: posicion,
    form,
    result: miami,
  });

  it("dice qué se cotizó: servicio, producto, posición con alícuotas y depósito", () => {
    expect(texto).toContain("*Cotización N° OG-20261010-1554*");
    expect(texto).toContain("Servicio: Courier comercial (régimen general, con aranceles)");
    expect(texto).toContain("Producto: auriculares bluetooth");
    expect(texto).toContain("8518.30.00.900M — DIE 20% · TE 3% · IVA 21%");
    expect(texto).toContain("Depósito de origen: Miami (EE.UU.)");
  });

  it("describe el envío: FOB, peso, unidades y bultos con medidas", () => {
    expect(texto).toContain(`(FOB): ${fmtUSD(300)}`);
    expect(texto).toContain("Peso: 3 kg · Unidades: 2");
    expect(texto).toContain("Bultos: 1 caja de 30 × 20 × 15 cm");
  });

  it("pone el costo real (sin IVA) como número principal y el total con IVA aparte", () => {
    expect(texto).toContain(`sin IVA recuperable): ${fmtUSD(miami.costoRealEfectivo)}*`);
    expect(texto).toContain(`Total a pagar (con IVA): ${fmtUSD(miami.totalUSD)}`);
    expect(texto).toContain(`IVA (crédito fiscal recuperable): ${fmtUSD(miami.recuperable.iva)}`);
    expect(texto).toContain(`Gastos en destino (sin IVA): ${fmtUSD(miami.totalGastosDestino)}`);
  });

  it("por unidad y por kg salen los dos del costo real (misma base)", () => {
    expect(texto).toContain(
      `Por unidad: ${fmtUSD(miami.costoPorUnidad)} · Por kg: ${fmtUSD(costoRealPorKg(miami))}`,
    );
    // 3 kg y 2 unidades: el costo real dividido por cada uno.
    expect(costoRealPorKg(miami)).toBeCloseTo(miami.costoRealEfectivo / 3, 6);
    expect(miami.costoPorUnidad).toBeCloseTo(miami.costoRealEfectivo / 2, 6);
  });

  it("incluye los pesos con el dólar de cada tramo", () => {
    expect(texto).toContain(fmtARS(miami.totalPesos ?? 0));
    expect(texto).toContain("al CCL $1606.6");
    expect(texto).toContain("al BNA $1535");
  });

  it("no nombra a VEGROUP ni lleva el número: el destino va en el link", () => {
    expect(texto).not.toMatch(/vegroup|7639/i);
  });

  it("en pequeños envíos aclara el servicio y la franquicia", () => {
    const t = textoCourier({
      refNumber: "OG-1",
      regimen: "pequeños",
      producto: "x",
      selected: { ...posicion, sim: "0000.04.56.000T", die: 0, te: 0 },
      form,
      result: miami,
    });
    expect(t).toContain("Pequeños envíos (régimen simplificado, franquicia)");
  });

  it("avisa cuando el peso volumétrico supera al real", () => {
    const grande = calcAllRoutes({
      ...entrada,
      fob: "300",
      largo: "100",
      ancho: "100",
      alto: "100",
      die: 20,
      te: 3,
      iva: 21,
    }).results[0];
    if (!grande) throw new Error("sin resultado");
    const t = textoCourier({
      refNumber: "OG-1",
      regimen: "general",
      producto: "x",
      selected: posicion,
      form: { ...form, largo: "100", ancho: "100", alto: "100" },
      result: grande,
    });
    expect(t).toContain("el peso volumétrico");
  });
});

describe("textoIntegral", () => {
  const integral = calcAllIntegral(entrada).results.find((r) => r.route === "miami");
  if (!integral) throw new Error("falta la ruta miami");
  const texto = textoIntegral({
    refNumber: "OG-2",
    producto: "",
    form: { pesoKg: "3", unidades: "2", cajas: 1, largo: "30", ancho: "20", alto: "15" },
    result: integral,
    dolarBN: 1535,
  });

  it("dice el servicio y el total, sin producto cuando no hay", () => {
    expect(texto).toContain("Courier integral (todo incluido, tarifa por kg, sin aranceles)");
    expect(texto).toContain(`Total a pagar: ${fmtUSD(integral.totalUSD)}`);
    expect(texto).not.toContain("Producto:");
  });
});

describe("linkWhatsappVegroup", () => {
  it("va directo al número de VEGROUP con el texto codificado", () => {
    expect(WHATSAPP_VEGROUP).toBe("5491176392303");
    expect(WHATSAPP_VEGROUP_LEGIBLE).toBe("+54 9 11 7639-2303");
    const url = new URL(linkWhatsappVegroup("Hola & chau\n*ok*"));
    expect(url.origin + url.pathname).toBe("https://wa.me/5491176392303");
    expect(url.searchParams.get("text")).toBe("Hola & chau\n*ok*");
  });
});
