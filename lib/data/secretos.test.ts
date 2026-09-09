// VGRP-30 — cálculo de entitlement para secretos (US-2 de requirements-vgrp30.md).

import { describe, expect, it } from "vitest";
import { resolverSecreto } from "./secretos";

function claims(nivel: "ninguno" | "principiante" | "avanzado" | undefined) {
  return nivel === undefined ? null : { app_metadata: { nivel } };
}

describe("resolverSecreto", () => {
  it.each([
    ["ninguno", "principiante"],
    ["ninguno", "avanzado"],
    ["principiante", "avanzado"],
  ] as const)(
    "nivel '%s' NO alcanza el mínimo '%s': devuelve null",
    (nivelUsuario, nivelMinimo) => {
      expect(resolverSecreto(claims(nivelUsuario), nivelMinimo, "el-secreto")).toBeNull();
    },
  );

  it.each([
    ["principiante", "principiante"],
    ["avanzado", "principiante"],
    ["avanzado", "avanzado"],
  ] as const)(
    "nivel '%s' SÍ alcanza el mínimo '%s': devuelve el secreto",
    (nivelUsuario, nivelMinimo) => {
      expect(resolverSecreto(claims(nivelUsuario), nivelMinimo, "el-secreto")).toBe("el-secreto");
    },
  );

  it("sin sesión (claims=null) y un mínimo real (principiante/avanzado): nunca devuelve el secreto", () => {
    expect(resolverSecreto(null, "principiante", "el-secreto")).toBeNull();
    expect(resolverSecreto(null, "avanzado", "el-secreto")).toBeNull();
  });

  it("no muta ni transforma el secreto: lo devuelve por referencia tal cual", () => {
    const secreto = { contacto: "+86 138 0000 0000" };
    expect(resolverSecreto(claims("avanzado"), "avanzado", secreto)).toBe(secreto);
  });
});
