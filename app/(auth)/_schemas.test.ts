import { describe, expect, it } from "vitest";
import { loginSchema, nuevaPasswordSchema, registroSchema, solicitarResetSchema } from "./_schemas";

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
    password: "testpass123",
    aceptaTerminos: true,
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

  it("rechaza si no se aceptan los términos", () => {
    const result = registroSchema.safeParse({ ...VALID, aceptaTerminos: false });
    expect(result.success).toBe(false);
  });

  it("rechaza si falta aceptaTerminos", () => {
    const { aceptaTerminos: _omitido, ...sinAceptacion } = VALID;
    const result = registroSchema.safeParse(sinAceptacion);
    expect(result.success).toBe(false);
  });
});

describe("solicitarResetSchema", () => {
  it("acepta un email válido", () => {
    const result = solicitarResetSchema.safeParse({ email: "a@b.com" });
    expect(result.success).toBe(true);
  });

  it("rechaza un email inválido", () => {
    const result = solicitarResetSchema.safeParse({ email: "no-es-un-email" });
    expect(result.success).toBe(false);
  });

  it("rechaza email vacío", () => {
    const result = solicitarResetSchema.safeParse({ email: "" });
    expect(result.success).toBe(false);
  });

  it("recorta espacios del email antes de validar", () => {
    const result = solicitarResetSchema.safeParse({ email: "  a@b.com  " });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.email).toBe("a@b.com");
  });
});

describe("nuevaPasswordSchema", () => {
  it("acepta una contraseña válida", () => {
    const result = nuevaPasswordSchema.safeParse({ password: "testpass123" });
    expect(result.success).toBe(true);
  });

  it("rechaza una contraseña de menos de 8 caracteres", () => {
    const result = nuevaPasswordSchema.safeParse({ password: "1234567" });
    expect(result.success).toBe(false);
  });

  it("rechaza una contraseña demasiado larga", () => {
    const result = nuevaPasswordSchema.safeParse({ password: "a".repeat(201) });
    expect(result.success).toBe(false);
  });
});
