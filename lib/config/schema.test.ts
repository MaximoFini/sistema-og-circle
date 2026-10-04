import { describe, expect, it } from "vitest";
import { configSchema } from "./schema";

// VGRP-59/60 (Bloque 13 — plan único): `precios` pasó de { principiante,
// avanzado } (con el .refine() de "avanzado >= principiante") a un solo
// precio { plan }. Ya no hay dos precios que comparar entre sí, así que ese
// refine desapareció — este archivo ahora sólo cubre la forma del schema.

const PRECIOS_BASE = { plan: 90_000 };
const PLAN_BASE = { nombre: "Plan X" };
const FLAGS_BASE = { checkout_habilitado: true, registro_habilitado: true, fase: "1" } as const;
const LINKS_BASE = {
  calculadora: "https://ogcircle.example/calculadora",
  whatsapp: "https://wa.me/5491100000000",
  traxcargo: "https://traxcargo.example",
};

function config(precios: { plan: number }) {
  return { precios, plan: PLAN_BASE, flags: FLAGS_BASE, links: LINKS_BASE };
}

describe("configSchema — precios.plan", () => {
  it("un entero positivo es válido", () => {
    expect(configSchema.safeParse(config(PRECIOS_BASE)).success).toBe(true);
  });

  it("cero o negativo es inválido", () => {
    expect(configSchema.safeParse(config({ plan: 0 })).success).toBe(false);
    expect(configSchema.safeParse(config({ plan: -1 })).success).toBe(false);
  });

  it("no entero es inválido", () => {
    expect(configSchema.safeParse(config({ plan: 90_000.5 })).success).toBe(false);
  });

  it("el schema de sólo precios (configSchema.shape.precios, el que usa patchBodySchema) valida igual", () => {
    expect(configSchema.shape.precios.safeParse({ plan: 90_000 }).success).toBe(true);
    expect(configSchema.shape.precios.safeParse({ plan: -1 }).success).toBe(false);
  });
});

describe("configSchema — plan.nombre", () => {
  it("un string no vacío es válido", () => {
    expect(configSchema.shape.plan.safeParse({ nombre: "Plan X" }).success).toBe(true);
  });

  it("vacío o sólo espacios es inválido", () => {
    expect(configSchema.shape.plan.safeParse({ nombre: "" }).success).toBe(false);
    expect(configSchema.shape.plan.safeParse({ nombre: "   " }).success).toBe(false);
  });
});

// El schema no es .strict(): una clave de más en `flags` (p. ej. una que ya
// no existe, como la vieja `mercadopago_habilitado` que todavía puede estar en
// Edge Config) tiene que seguir parseando y conservar el resto de los flags.
describe("configSchema — flags con clave de más", () => {
  it("un objeto flags con una clave desconocida sigue parseando y conserva registro_habilitado, checkout_habilitado y fase", () => {
    const parsed = configSchema.shape.flags.safeParse({
      ...FLAGS_BASE,
      mercadopago_habilitado: true,
    });
    expect(parsed.success).toBe(true);
    if (!parsed.success) throw new Error("no debería fallar");
    expect(parsed.data.registro_habilitado).toBe(true);
    expect(parsed.data.checkout_habilitado).toBe(true);
    expect(parsed.data.fase).toBe("1");
  });
});
