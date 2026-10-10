import { describe, expect, it } from "vitest";
import { hrefWhatsapp, numeroWhatsapp } from "./whatsapp";

describe("numeroWhatsapp", () => {
  it.each([
    ["+86 136 4221 5666", "8613642215666"],
    ["+54 9 11 3174-6191", "5491131746191"],
    ["(+54) 9 11 6108.8500", "5491161088500"],
    ["wa.me/5491131746191", "5491131746191"],
    ["https://wa.me/8613510176578/", "8613510176578"],
  ])("%s → %s", (contacto, esperado) => {
    expect(numeroWhatsapp(contacto)).toBe(esperado);
  });

  it.each([
    "contacto@agente.com",
    "WeChat: linli88",
    "CANARIO-3f2c1a90-1111-2222-3333-444455556666",
    "123 456", // muy corto para un número internacional
    "+1234567890123456", // más de 15 dígitos
    "",
  ])("%s no es un teléfono", (contacto) => {
    expect(numeroWhatsapp(contacto)).toBeNull();
  });
});

describe("hrefWhatsapp", () => {
  it("arma el link a wa.me con el saludo codificado", () => {
    expect(hrefWhatsapp("+86 136 4221 5666", "Lin Li")).toBe(
      "https://wa.me/8613642215666?text=Hola%20Lin%20Li%2C%20te%20escribo%20desde%20OG%20Circle.",
    );
  });

  it("sin teléfono no hay link", () => {
    expect(hrefWhatsapp("WeChat: linli88", "Lin Li")).toBeNull();
  });
});
