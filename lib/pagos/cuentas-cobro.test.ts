// VGRP-62 — validación de cuentas de cobro (módulo puro, sin base).

import { describe, expect, it } from "vitest";
import { cuentaCobroPatchSchema, cuentaCobroSchema, cuitValido } from "./cuentas-cobro";

const VALIDA = {
  titular: "OG Circle SRL",
  cuit: "20123456786",
  banco: "Banco de prueba",
  cbu_cvu: "0000000000000000000001",
  alias: "og.circle.test",
};

describe("cuitValido", () => {
  it("acepta un CUIT con el dígito verificador correcto", () => {
    expect(cuitValido("20123456786")).toBe(true);
  });

  it("rechaza el mismo CUIT con el verificador cambiado", () => {
    expect(cuitValido("20123456787")).toBe(false);
    expect(cuitValido("20123456780")).toBe(false);
  });

  it("rechaza largos distintos de 11 y caracteres no numéricos", () => {
    expect(cuitValido("2012345678")).toBe(false);
    expect(cuitValido("201234567866")).toBe(false);
    expect(cuitValido("2012345678a")).toBe(false);
    expect(cuitValido("")).toBe(false);
  });

  it("rechaza todo prefijo cuyo resto da 10: no existe como dígito verificador", () => {
    // Se busca por fuerza bruta un prefijo de 10 dígitos con resto 1 (esperado
    // 11 - 1 = 10) en vez de hardcodear uno, así el test no depende de memoria.
    const pesos = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2];
    let prefijo = "";
    for (let n = 2_000_000_000; n < 2_000_001_000; n++) {
      const digitos = String(n);
      const suma = pesos.reduce((acc, p, i) => acc + p * Number(digitos[i]), 0);
      if (suma % 11 === 1) {
        prefijo = digitos;
        break;
      }
    }
    expect(prefijo).not.toBe("");
    for (let dv = 0; dv <= 9; dv++) {
      expect(cuitValido(`${prefijo}${dv}`)).toBe(false);
    }
  });
});

describe("alias", () => {
  const aliasValido = (alias: string) => cuentaCobroSchema.safeParse({ ...VALIDA, alias }).success;

  it.each(["abcdef", "og.circle-1", "a".repeat(20)])("acepta %s", (alias) => {
    expect(aliasValido(alias)).toBe(true);
  });

  it.each(["abcde", "a".repeat(21), "con espacio", "ñandú.cuenta", "guion_bajo", ""])(
    "rechaza %j",
    (alias) => {
      expect(aliasValido(alias)).toBe(false);
    },
  );
});

describe("cuentaCobroSchema", () => {
  it("acepta una cuenta válida y la normaliza", () => {
    const out = cuentaCobroSchema.parse({
      ...VALIDA,
      titular: "  OG Circle SRL  ",
      cuit: "20-12345678-6",
      cbu_cvu: "0000 0000 0000 0000 0000 01",
      notas: "   ",
    });
    expect(out).toEqual({ ...VALIDA, notas: null });
  });

  it("guarda las notas con contenido", () => {
    expect(cuentaCobroSchema.parse({ ...VALIDA, notas: " pagos en pesos " }).notas).toBe(
      "pagos en pesos",
    );
  });

  it("devuelve un error por campo inválido", () => {
    const resultado = cuentaCobroSchema.safeParse({
      titular: " ",
      cuit: "20123456787",
      banco: "",
      cbu_cvu: "123",
      alias: "corto",
    });
    expect(resultado.success).toBe(false);
    if (resultado.success) return;
    expect(Object.keys(resultado.error.flatten().fieldErrors).sort()).toEqual([
      "alias",
      "banco",
      "cbu_cvu",
      "cuit",
      "titular",
    ]);
  });

  it("exige todos los campos menos notas", () => {
    expect(cuentaCobroSchema.safeParse({}).success).toBe(false);
  });

  it("no deja que el body fije `activa`: la clave se descarta", () => {
    const out = cuentaCobroSchema.parse({ ...VALIDA, activa: true });
    expect("activa" in out).toBe(false);
  });
});

describe("cuentaCobroPatchSchema", () => {
  it("acepta un subconjunto de campos y no inventa los demás", () => {
    expect(cuentaCobroPatchSchema.parse({ alias: "nuevo.alias" })).toEqual({
      alias: "nuevo.alias",
    });
  });

  it("un PATCH sin `notas` no las pisa con null", () => {
    expect("notas" in cuentaCobroPatchSchema.parse({ banco: "Otro" })).toBe(false);
  });

  it("un PATCH con notas vacías sí las borra", () => {
    expect(cuentaCobroPatchSchema.parse({ notas: "" })).toEqual({ notas: null });
  });

  it("rechaza un body vacío o con sólo claves desconocidas", () => {
    expect(cuentaCobroPatchSchema.safeParse({}).success).toBe(false);
    expect(cuentaCobroPatchSchema.safeParse({ activa: true }).success).toBe(false);
  });

  it("valida igual que el alta cuando el campo viene", () => {
    expect(cuentaCobroPatchSchema.safeParse({ cuit: "20123456787" }).success).toBe(false);
    expect(cuentaCobroPatchSchema.safeParse({ cbu_cvu: "1" }).success).toBe(false);
  });
});
