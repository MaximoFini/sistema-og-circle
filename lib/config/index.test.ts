import { beforeEach, describe, expect, it, vi } from "vitest";
import { configSchema } from "./schema";

const mockGet = vi.fn();

vi.mock("@vercel/edge-config", () => ({
  get: (key: string) => mockGet(key),
}));

const VALID_CONFIG = {
  precios: { principiante: 75000, avanzado: 125000 },
  flags: { checkout_habilitado: true, registro_habilitado: true, fase: "2" as const },
  links: {
    calculadora: "https://ogcircle.com/calculadora",
    whatsapp: "https://wa.me/5491100000000",
    traxcargo: "https://traxcargo.com",
  },
};

describe("configSchema", () => {
  it("acepta una configuración válida", () => {
    const result = configSchema.safeParse(VALID_CONFIG);
    expect(result.success).toBe(true);
  });
});

describe("getConfig", () => {
  beforeEach(() => {
    mockGet.mockReset();
  });

  it("señala el fallo sin devolver un precio adivinado cuando precios es inválido/faltante", async () => {
    mockGet.mockImplementation(async (key: string) => {
      if (key === "precios") return undefined; // clave ausente en Edge Config
      if (key === "flags") return VALID_CONFIG.flags;
      if (key === "links") return VALID_CONFIG.links;
      return undefined;
    });

    const { getConfig } = await import("./index");
    const config = await getConfig();

    expect(config.precios.ok).toBe(false);
    if (config.precios.ok) throw new Error("no debería ser ok");
    expect(typeof config.precios.error).toBe("string");
    // Nunca hay un número "adivinado" en el resultado de fallo.
    expect(config.precios).not.toHaveProperty("precios");
  });

  it("cae al default hardcodeado sin romper cuando links es inválido", async () => {
    mockGet.mockImplementation(async (key: string) => {
      if (key === "precios") return VALID_CONFIG.precios;
      if (key === "flags") return VALID_CONFIG.flags;
      if (key === "links") return { calculadora: "no-es-una-url" };
      return undefined;
    });

    const { getConfig } = await import("./index");
    const config = await getConfig();

    expect(config.precios).toEqual({ ok: true, precios: VALID_CONFIG.precios });
    expect(config.links).toEqual({
      calculadora: "https://ogcircle.com/calculadora",
      whatsapp: "https://wa.me/5491100000000",
      traxcargo: "https://traxcargo.com",
    });
  });

  it("cae a flags conservadores (todo apagado) cuando falla la lectura", async () => {
    mockGet.mockImplementation(async () => {
      throw new Error("No connection string provided");
    });

    const { getConfig } = await import("./index");
    const config = await getConfig();

    expect(config.precios.ok).toBe(false);
    expect(config.flags).toEqual({
      checkout_habilitado: false,
      registro_habilitado: false,
      fase: "2",
    });
  });
});
