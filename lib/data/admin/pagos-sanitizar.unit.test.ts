// VGRP-47 §7 — `sanitizarPayloadRaw` (lib/data/admin/pagos.ts) es una función
// pura (allowlist + redacción recursiva, sin I/O): no hace falta Postgres real
// para confirmar que un número de tarjeta, un token de nivel superior y una
// clave sensible anidada dentro de `metadata` (objeto libre del lado de
// Mercado Pago) nunca llegan al resultado. Es el mínimo indispensable que pide
// el ticket; el test de integración que siembra un pago real y confirma que
// `obtenerPago()` devuelve la versión sanitizada no se agrega por separado
// porque no ejercitaría nada que este test unitario no cubra ya (obtenerPago
// llama a sanitizarPayloadRaw tal cual, sin lógica propia de por medio — ver
// lib/data/admin/pagos.ts línea ~291).

import { describe, expect, it } from "vitest";
import type { Json } from "../../database.types";
import { sanitizarPayloadRaw } from "./pagos";

describe("sanitizarPayloadRaw (VGRP-47 §7 — fuga de payload_raw)", () => {
  const payloadConDatosSensibles: Json = {
    id: 123,
    status: "approved",
    status_detail: "accredited",
    date_created: "2026-09-01T00:00:00Z",
    transaction_amount: 5000,
    currency_id: "ARS",
    live_mode: true,
    // Campo NO permitido por la allowlist: número de tarjeta crudo.
    card: {
      number: "4509 9535 6623 3704",
      last_four_digits: "3704",
    },
    // Campo NO permitido: token de la transacción.
    token: "ff8080814c11e237014c1ff593b57b4d",
    // metadata SÍ está en la allowlist (es un objeto libre de MP) — pero una
    // clave sensible anidada adentro tiene que redactarse igual.
    metadata: {
      pedido_id: "abc-123",
      internal_api_key: "sk_live_super_secreta",
      nested: { authorization_header: "Bearer secreto-anidado" },
    },
    payer: {
      email: "comprador@test.og-circle.invalid",
      identification: { type: "DNI", number: "12345678" },
      // No está en PAYER_VISIBLE: no debería sobrevivir.
      phone: { number: "1155551234" },
    },
  };

  const resultado = sanitizarPayloadRaw(payloadConDatosSensibles);
  const resultadoStr = JSON.stringify(resultado);

  it("el número de tarjeta no aparece en ningún lado del resultado", () => {
    expect(resultadoStr).not.toContain("4509 9535 6623 3704");
    expect(resultadoStr).not.toContain("card");
  });

  it("el token de la transacción no aparece en el resultado", () => {
    expect(resultadoStr).not.toContain("ff8080814c11e237014c1ff593b57b4d");
    expect((resultado as Record<string, unknown>).token).toBeUndefined();
  });

  it("una clave sensible anidada dentro de metadata (a cualquier profundidad) se redacta", () => {
    expect(resultadoStr).not.toContain("sk_live_super_secreta");
    expect(resultadoStr).not.toContain("Bearer secreto-anidado");

    const metadata = (resultado as { metadata?: Record<string, unknown> }).metadata;
    expect(metadata?.internal_api_key).toBe("[redactado]");
    expect((metadata?.nested as Record<string, unknown> | undefined)?.authorization_header).toBe(
      "[redactado]",
    );
    // La clave no sensible del mismo objeto sobrevive intacta.
    expect(metadata?.pedido_id).toBe("abc-123");
  });

  it("payer se recorta a la allowlist (email + identification), el teléfono no pasa", () => {
    const payer = (resultado as { payer?: Record<string, unknown> }).payer;
    expect(payer?.email).toBe("comprador@test.og-circle.invalid");
    expect(payer?.identification).toEqual({ type: "DNI", number: "12345678" });
    expect(payer?.phone).toBeUndefined();
  });

  it("los campos permitidos de la allowlist sí pasan intactos", () => {
    expect((resultado as Record<string, unknown>).id).toBe(123);
    expect((resultado as Record<string, unknown>).status).toBe("approved");
    expect((resultado as Record<string, unknown>).transaction_amount).toBe(5000);
  });

  it("un payload null o no-objeto devuelve un objeto vacío, sin tirar", () => {
    expect(sanitizarPayloadRaw(null)).toEqual({});
    expect(sanitizarPayloadRaw(undefined)).toEqual({});
    expect(sanitizarPayloadRaw("no-es-un-objeto" as unknown as Json)).toEqual({});
  });
});
