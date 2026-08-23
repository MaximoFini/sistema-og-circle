import { describe, expect, it } from "vitest";
import { loginSchema, registroSchema } from "./_schemas";

describe("loginSchema", () => {
  it("acepta email y password válidos", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "algo" });
    expect(result.success).toBe(true);
  });

  it("rechaza un email inválido", () => {
    const result = loginSchema.safeParse({ email: "no-es-un-email", password: "algo" });
    expect(result.success).toBe(false);
  });

  it("rechaza password vacía", () => {
    const result = loginSchema.safeParse({ email: "a@b.com", password: "" });
    expect(result.success).toBe(false);
  });

  it("recorta espacios del email antes de validar", () => {
    const result = loginSchema.safeParse({ email: "  a@b.com  ", password: "algo" });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("a@b.com");
  });
});

describe("registroSchema", () => {
  const VALID = {
    nombre: "Jero",
    email: "a@b.com",
    telefono: "+54 9 11 1234-5678",
    password: "unapass123",
  };

  it("acepta datos válidos", () => {
    expect(registroSchema.safeParse(VALID).success).toBe(true);
  });

  it("rechaza password de menos de 8 caracteres", () => {
    const result = registroSchema.safeParse({ ...VALID, password: "1234567" });
    expect(result.success).toBe(false);
  });

  it("rechaza nombre vacío", () => {
    const result = registroSchema.safeParse({ ...VALID, nombre: "   " });
    expect(result.success).toBe(false);
  });

  it("rechaza teléfono demasiado corto", () => {
    const result = registroSchema.safeParse({ ...VALID, telefono: "123" });
    expect(result.success).toBe(false);
  });

  it("rechaza email inválido", () => {
    const result = registroSchema.safeParse({ ...VALID, email: "no-es-un-email" });
    expect(result.success).toBe(false);
  });
});
