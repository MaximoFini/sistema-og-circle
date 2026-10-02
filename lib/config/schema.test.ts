import { describe, expect, it } from "vitest";
import { configSchema } from "./schema";

// Hallazgo de auditoría del panel de admin (Bloque 9): configSchema validaba
// cada precio por separado (positive(), int()) pero no impedía que el precio
// de 'avanzado' quedara por debajo del de 'principiante' — un PATCH así
// pasaba la validación igual. Ver el .refine() de schema.ts.

const PRECIOS_BASE = { principiante: 75_000, avanzado: 125_000 };
const FLAGS_BASE = { checkout_habilitado: true, registro_habilitado: true, fase: "1" } as const;
const LINKS_BASE = {
  calculadora: "https://ogcircle.example/calculadora",
  whatsapp: "https://wa.me/5491100000000",
  traxcargo: "https://traxcargo.example",
};

function config(precios: { principiante: number; avanzado: number }) {
  return { precios, flags: FLAGS_BASE, links: LINKS_BASE };
}

describe("configSchema — precios.avanzado >= precios.principiante", () => {
  it("avanzado > principiante -> válido", () => {
    expect(configSchema.safeParse(config(PRECIOS_BASE)).success).toBe(true);
  });

  it("avanzado === principiante -> válido (empate permitido, sólo se prohíbe que sea MENOR)", () => {
    expect(configSchema.safeParse(config({ principiante: 75_000, avanzado: 75_000 })).success).toBe(
      true,
    );
  });

  it("avanzado < principiante -> inválido, error en el campo 'avanzado'", () => {
    const resultado = configSchema.safeParse(config({ principiante: 125_000, avanzado: 75_000 }));
    expect(resultado.success).toBe(false);
    if (!resultado.success) {
      expect(resultado.error.issues[0]?.path).toEqual(["precios", "avanzado"]);
    }
  });

  it("el schema de sólo precios (configSchema.shape.precios, el que usa patchBodySchema) aplica la misma regla", () => {
    const resultado = configSchema.shape.precios.safeParse({
      principiante: 125_000,
      avanzado: 75_000,
    });
    expect(resultado.success).toBe(false);
  });
});
