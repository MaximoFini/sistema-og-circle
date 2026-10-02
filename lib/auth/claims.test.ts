import { describe, expect, it } from "vitest";
import { getNivel, getRol, hasNivel, nivelAlcanzaOSupera, tieneAcceso } from "./claims";

describe("getNivel", () => {
  it("lee un nivel válido de app_metadata", () => {
    expect(getNivel({ app_metadata: { nivel: "completo" } })).toBe("completo");
  });

  it("devuelve el default 'ninguno' si falta app_metadata", () => {
    expect(getNivel({})).toBe("ninguno");
  });

  it("devuelve el default 'ninguno' si claims es null/undefined", () => {
    expect(getNivel(null)).toBe("ninguno");
    expect(getNivel(undefined)).toBe("ninguno");
  });

  it("devuelve el default 'ninguno' ante un valor que no es del enum", () => {
    expect(getNivel({ app_metadata: { nivel: "premium" } })).toBe("ninguno");
  });

  // VGRP-60 — transición de tokens: un JWT emitido antes del deploy de
  // VGRP-59 trae 'principiante'/'avanzado'. Mientras no venza (~1h), tiene
  // que seguir dando acceso completo en vez de quedar en 'ninguno'.
  it("mapea los valores viejos del enum de dos niveles a 'completo' (transición de tokens)", () => {
    expect(getNivel({ app_metadata: { nivel: "principiante" } })).toBe("completo");
    expect(getNivel({ app_metadata: { nivel: "avanzado" } })).toBe("completo");
  });
});

describe("getRol", () => {
  it("lee un rol válido de app_metadata", () => {
    expect(getRol({ app_metadata: { rol: "admin" } })).toBe("admin");
  });

  it("devuelve el default 'user' si falta o es inválido", () => {
    expect(getRol({})).toBe("user");
    expect(getRol({ app_metadata: { rol: "superadmin" } })).toBe("user");
  });
});

describe("hasNivel", () => {
  it("respeta el orden ninguno < completo", () => {
    const claims = { app_metadata: { nivel: "completo" } };
    expect(hasNivel(claims, "ninguno")).toBe(true);
    expect(hasNivel(claims, "completo")).toBe(true);
  });

  it("sin claims, sólo cumple el mínimo 'ninguno'", () => {
    expect(hasNivel(null, "ninguno")).toBe(true);
    expect(hasNivel(null, "completo")).toBe(false);
  });

  it("un token viejo ('avanzado') cumple el mínimo 'completo'", () => {
    const claims = { app_metadata: { nivel: "avanzado" } };
    expect(hasNivel(claims, "completo")).toBe(true);
  });
});

describe("nivelAlcanzaOSupera", () => {
  it("respeta el orden ninguno < completo", () => {
    expect(nivelAlcanzaOSupera("ninguno", "ninguno")).toBe(true);
    expect(nivelAlcanzaOSupera("ninguno", "completo")).toBe(false);
    expect(nivelAlcanzaOSupera("completo", "ninguno")).toBe(true);
    expect(nivelAlcanzaOSupera("completo", "completo")).toBe(true);
  });
});

describe("tieneAcceso", () => {
  it("true con el plan completo", () => {
    expect(tieneAcceso({ app_metadata: { nivel: "completo" } })).toBe(true);
  });

  it("false sin plan, sin claims, o con un token viejo ya mapeado por getNivel", () => {
    expect(tieneAcceso({ app_metadata: { nivel: "ninguno" } })).toBe(false);
    expect(tieneAcceso(null)).toBe(false);
    // Un token viejo 'principiante'/'avanzado' SÍ da acceso — getNivel() ya
    // lo mapea a 'completo' (transición de tokens).
    expect(tieneAcceso({ app_metadata: { nivel: "principiante" } })).toBe(true);
  });
});
