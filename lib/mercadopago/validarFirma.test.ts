import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { validarFirmaMercadoPago } from "./validarFirma";

const SECRET = "test-secret-no-real";

/** Arma un `x-signature` válido para un manifest dado, igual que lo haría MP. */
function firmarManifest(params: { dataId: string; requestId: string; ts: string }): string {
  const manifest = `id:${params.dataId};request-id:${params.requestId};ts:${params.ts};`;
  const hash = createHmac("sha256", SECRET).update(manifest).digest("hex");
  return `ts=${params.ts},v1=${hash}`;
}

describe("validarFirmaMercadoPago", () => {
  it("acepta una firma válida", () => {
    const ts = "1700000000000";
    const requestId = "req-abc-123";
    const dataId = "123456789";
    const xSignature = firmarManifest({ dataId, requestId, ts });

    const resultado = validarFirmaMercadoPago({
      xSignature,
      xRequestId: requestId,
      dataId,
      secret: SECRET,
    });

    expect(resultado).toBe(true);
  });

  it("rechaza una firma con el hash incorrecto", () => {
    const ts = "1700000000000";
    const requestId = "req-abc-123";
    const dataId = "123456789";

    const resultado = validarFirmaMercadoPago({
      xSignature: `ts=${ts},v1=${"0".repeat(64)}`,
      xRequestId: requestId,
      dataId,
      secret: SECRET,
    });

    expect(resultado).toBe(false);
  });

  it("rechaza cuando el secreto no coincide (misma firma, otra clave)", () => {
    const ts = "1700000000000";
    const requestId = "req-abc-123";
    const dataId = "123456789";
    const xSignature = firmarManifest({ dataId, requestId, ts });

    const resultado = validarFirmaMercadoPago({
      xSignature,
      xRequestId: requestId,
      dataId,
      secret: "otro-secreto-distinto",
    });

    expect(resultado).toBe(false);
  });

  it("rechaza si falta x-signature", () => {
    const resultado = validarFirmaMercadoPago({
      xSignature: null,
      xRequestId: "req-abc-123",
      dataId: "123456789",
      secret: SECRET,
    });

    expect(resultado).toBe(false);
  });

  it("rechaza si falta x-request-id", () => {
    const ts = "1700000000000";
    const dataId = "123456789";
    const xSignature = firmarManifest({ dataId, requestId: "req-abc-123", ts });

    const resultado = validarFirmaMercadoPago({
      xSignature,
      xRequestId: null,
      dataId,
      secret: SECRET,
    });

    expect(resultado).toBe(false);
  });

  it("rechaza si falta data.id", () => {
    const ts = "1700000000000";
    const requestId = "req-abc-123";
    const xSignature = firmarManifest({ dataId: "123456789", requestId, ts });

    const resultado = validarFirmaMercadoPago({
      xSignature,
      xRequestId: requestId,
      dataId: null,
      secret: SECRET,
    });

    expect(resultado).toBe(false);
  });

  it("rechaza un x-signature con forma inválida (sin ts o sin v1)", () => {
    const resultado = validarFirmaMercadoPago({
      xSignature: "v1=abc123",
      xRequestId: "req-abc-123",
      dataId: "123456789",
      secret: SECRET,
    });

    expect(resultado).toBe(false);
  });

  it("no explota (y rechaza) con buffers de largo distinto entre v1 y el hash calculado", () => {
    const ts = "1700000000000";
    const requestId = "req-abc-123";
    const dataId = "123456789";

    // v1 con un largo hex distinto al de un HMAC-SHA256 (64 chars) — esto es
    // lo que `timingSafeEqual` rechazaría lanzando si se le pasara directo.
    const resultado = validarFirmaMercadoPago({
      xSignature: `ts=${ts},v1=abcd`,
      xRequestId: requestId,
      dataId,
      secret: SECRET,
    });

    expect(resultado).toBe(false);
  });

  it("arma el manifest correctamente: cambiar cualquier componente invalida la firma", () => {
    const ts = "1700000000000";
    const requestId = "req-abc-123";
    const dataId = "123456789";
    const xSignature = firmarManifest({ dataId, requestId, ts });

    // Mismo x-signature, pero se cambia el request-id real usado al validar:
    // el manifest recalculado ya no matchea.
    const resultado = validarFirmaMercadoPago({
      xSignature,
      xRequestId: "otro-request-id",
      dataId,
      secret: SECRET,
    });

    expect(resultado).toBe(false);
  });

  it("convierte data.id a minúscula antes de armar el manifest", () => {
    const ts = "1700000000000";
    const requestId = "req-abc-123";
    // Firmado con el id ya en minúscula (como lo pide MP).
    const xSignature = firmarManifest({ dataId: "abc123", requestId, ts });

    const resultado = validarFirmaMercadoPago({
      xSignature,
      xRequestId: requestId,
      dataId: "ABC123",
      secret: SECRET,
    });

    expect(resultado).toBe(true);
  });
});
