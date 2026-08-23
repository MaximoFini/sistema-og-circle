import { describe, expect, it } from "vitest";
import { DEFAULT_REDIRECT, safeRedirectPath } from "./redirect";

describe("safeRedirectPath", () => {
  it("acepta un path relativo válido", () => {
    expect(safeRedirectPath("/dashboard")).toBe("/dashboard");
    expect(safeRedirectPath("/agentes/123?tab=swift")).toBe("/agentes/123?tab=swift");
    expect(safeRedirectPath("/")).toBe("/");
  });

  it("rechaza protocol-relative con doble barra (//evil.com)", () => {
    expect(safeRedirectPath("//evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("//evil.com/login")).toBe(DEFAULT_REDIRECT);
  });

  it("rechaza protocol-relative con backslash (/\\evil.com)", () => {
    expect(safeRedirectPath("/\\evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("/\\/evil.com")).toBe(DEFAULT_REDIRECT);
  });

  it("rechaza una URL absoluta a otro host", () => {
    expect(safeRedirectPath("https://evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("http://evil.com/x")).toBe(DEFAULT_REDIRECT);
  });

  it("rechaza esquemas ejecutables", () => {
    expect(safeRedirectPath("javascript:alert(1)")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("data:text/html,<script>alert(1)</script>")).toBe(DEFAULT_REDIRECT);
  });

  it("rechaza el string vacío y undefined/null", () => {
    expect(safeRedirectPath("")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(undefined)).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath(null)).toBe(DEFAULT_REDIRECT);
  });

  it("rechaza un path que no empieza con barra", () => {
    expect(safeRedirectPath("dashboard")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("evil.com")).toBe(DEFAULT_REDIRECT);
  });

  it("rechaza caracteres de control y espacios que el browser descartaría", () => {
    expect(safeRedirectPath("/\t/evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("/ /evil.com")).toBe(DEFAULT_REDIRECT);
    expect(safeRedirectPath("\n//evil.com")).toBe(DEFAULT_REDIRECT);
  });

  it("permite pasar un fallback propio", () => {
    expect(safeRedirectPath("https://evil.com", "/login")).toBe("/login");
  });
});
