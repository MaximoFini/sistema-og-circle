// VGRP-30 — cálculo de entitlement para secretos (US-2 de requirements-vgrp30.md).
// VGRP-59/60 (Bloque 13 — plan único): resolverSecreto() ya no recibe un
// "nivel mínimo" — sólo claims + secreto.

import { describe, expect, it } from "vitest";
import { resolverSecreto } from "./secretos";

function claims(nivel: "ninguno" | "completo" | undefined) {
  return nivel === undefined ? null : { app_metadata: { nivel } };
}

describe("resolverSecreto", () => {
  it("nivel 'ninguno' nunca devuelve el secreto", () => {
    expect(resolverSecreto(claims("ninguno"), "el-secreto")).toBeNull();
  });

  it("nivel 'completo' sí devuelve el secreto", () => {
    expect(resolverSecreto(claims("completo"), "el-secreto")).toBe("el-secreto");
  });

  it("sin sesión (claims=null) nunca devuelve el secreto", () => {
    expect(resolverSecreto(null, "el-secreto")).toBeNull();
  });

  it("no muta ni transforma el secreto: lo devuelve por referencia tal cual", () => {
    const secreto = { contacto: "+86 138 0000 0000" };
    expect(resolverSecreto(claims("completo"), secreto)).toBe(secreto);
  });
});
