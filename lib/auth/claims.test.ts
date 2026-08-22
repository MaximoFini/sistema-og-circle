import { describe, expect, it } from "vitest";
import { getNivel, getRol, hasNivel } from "./claims";

describe("getNivel", () => {
  it("lee un nivel válido de app_metadata", () => {
    expect(getNivel({ app_metadata: { nivel: "avanzado" } })).toBe("avanzado");
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
  it("respeta el orden ninguno < principiante < avanzado", () => {
    const claims = { app_metadata: { nivel: "principiante" } };
    expect(hasNivel(claims, "ninguno")).toBe(true);
    expect(hasNivel(claims, "principiante")).toBe(true);
    expect(hasNivel(claims, "avanzado")).toBe(false);
  });

  it("un nivel 'avanzado' cumple cualquier mínimo", () => {
    const claims = { app_metadata: { nivel: "avanzado" } };
    expect(hasNivel(claims, "ninguno")).toBe(true);
    expect(hasNivel(claims, "principiante")).toBe(true);
    expect(hasNivel(claims, "avanzado")).toBe(true);
  });

  it("sin claims, sólo cumple el mínimo 'ninguno'", () => {
    expect(hasNivel(null, "ninguno")).toBe(true);
    expect(hasNivel(null, "principiante")).toBe(false);
  });
});
