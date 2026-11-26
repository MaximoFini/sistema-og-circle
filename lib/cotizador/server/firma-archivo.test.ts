import { describe, expect, it } from "vitest";
import { coincideConMediaType } from "./firma-archivo";

const b64 = (bytes: number[]) => Buffer.from(bytes).toString("base64");

describe("coincideConMediaType()", () => {
  it("acepta cada formato con sus magic bytes", () => {
    expect(coincideConMediaType(b64([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31]), "application/pdf")).toBe(
      true,
    );
    expect(coincideConMediaType(b64([0xff, 0xd8, 0xff, 0xe0, 0, 0]), "image/jpeg")).toBe(true);
    expect(
      coincideConMediaType(b64([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0]), "image/png"),
    ).toBe(true);
    expect(coincideConMediaType(b64([0x47, 0x49, 0x46, 0x38, 0x39, 0x61]), "image/gif")).toBe(true);
    expect(
      coincideConMediaType(
        b64([0x52, 0x49, 0x46, 0x46, 1, 2, 3, 4, 0x57, 0x45, 0x42, 0x50]),
        "image/webp",
      ),
    ).toBe(true);
  });

  it("rechaza contenido que no coincide con el tipo declarado", () => {
    expect(coincideConMediaType(b64([0x25, 0x50, 0x44, 0x46]), "image/png")).toBe(false);
    expect(
      coincideConMediaType(
        Buffer.from("<script>alert(1)</script>").toString("base64"),
        "image/jpeg",
      ),
    ).toBe(false);
  });

  it("rechaza un mediaType desconocido", () => {
    expect(coincideConMediaType(b64([0x25, 0x50, 0x44, 0x46]), "text/html")).toBe(false);
  });
});
