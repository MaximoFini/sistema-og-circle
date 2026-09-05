import { beforeEach, describe, expect, it, vi } from "vitest";

const mockGetPrecios = vi.fn();

vi.mock("../config", () => ({
  getPrecios: () => mockGetPrecios(),
}));

const PRECIOS_OK = { principiante: 75000, avanzado: 125000 };

describe("armarPreferencia", () => {
  beforeEach(() => {
    mockGetPrecios.mockReset();
    // `getSiteUrl()` cae a este mismo valor si la env var no está seteada,
    // pero fijarla acá hace los asserts de back_urls deterministas sin
    // depender de qué haya (o no) en el entorno donde corra el test.
    process.env.NEXT_PUBLIC_SITE_URL = "https://ogcircle.example";
  });

  it("usa el precio de 'principiante' de getPrecios() para ese nivel", async () => {
    mockGetPrecios.mockResolvedValue({ ok: true, precios: PRECIOS_OK });

    const { armarPreferencia } = await import("./preferencia");
    const result = await armarPreferencia("principiante", "user-123");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("no debería ser ok:false");
    expect(result.preferenceData.items[0].unit_price).toBe(75000);
  });

  it("usa el precio de 'avanzado' de getPrecios() para ese nivel", async () => {
    mockGetPrecios.mockResolvedValue({ ok: true, precios: PRECIOS_OK });

    const { armarPreferencia } = await import("./preferencia");
    const result = await armarPreferencia("avanzado", "user-123");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("no debería ser ok:false");
    expect(result.preferenceData.items[0].unit_price).toBe(125000);
  });

  it("siempre incluye external_reference (userId) y metadata.nivel", async () => {
    mockGetPrecios.mockResolvedValue({ ok: true, precios: PRECIOS_OK });

    const { armarPreferencia } = await import("./preferencia");
    const result = await armarPreferencia("avanzado", "user-abc-456");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("no debería ser ok:false");
    expect(result.preferenceData.external_reference).toBe("user-abc-456");
    expect(result.preferenceData.metadata).toEqual({ nivel: "avanzado" });
  });

  it("arma back_urls absolutas de éxito/pendiente/fallo apuntando a /comprar", async () => {
    mockGetPrecios.mockResolvedValue({ ok: true, precios: PRECIOS_OK });

    const { armarPreferencia } = await import("./preferencia");
    const result = await armarPreferencia("principiante", "user-123");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("no debería ser ok:false");
    expect(result.preferenceData.back_urls?.success).toBe(
      "https://ogcircle.example/comprar/pendiente?nivel=principiante",
    );
    expect(result.preferenceData.back_urls?.pending).toBe(
      "https://ogcircle.example/comprar/pendiente?nivel=principiante",
    );
    expect(result.preferenceData.back_urls?.failure).toBe("https://ogcircle.example/comprar");
    expect(result.preferenceData.auto_return).toBe("approved");
  });

  it("devuelve un error explícito (sin lanzar ni inventar un precio) cuando getPrecios() falla", async () => {
    mockGetPrecios.mockResolvedValue({
      ok: false,
      error: "precios inválidos o no disponibles en Edge Config",
    });

    const { armarPreferencia } = await import("./preferencia");
    const result = await armarPreferencia("principiante", "user-123");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería ser ok:true");
    expect(typeof result.error).toBe("string");
    expect(result).not.toHaveProperty("preferenceData");
  });

  // VGRP-22 / CLAUDE.md — "Decisiones cerradas del PRD: sin descuentos de
  // ningún tipo (ni campo de código promocional)". El SDK expone
  // `coupon_code`/`coupon_labels` en `PreferenceRequest`; este test es la red
  // de contención para que nadie los sume sin una decisión explícita nueva.
  it("nunca agrega campos de cupón/descuento/código promocional", async () => {
    mockGetPrecios.mockResolvedValue({ ok: true, precios: PRECIOS_OK });

    const { armarPreferencia } = await import("./preferencia");
    const result = await armarPreferencia("avanzado", "user-123");

    expect(result.ok).toBe(true);
    if (!result.ok) throw new Error("no debería ser ok:false");
    expect(result.preferenceData).not.toHaveProperty("coupon_code");
    expect(result.preferenceData).not.toHaveProperty("coupon_labels");
  });
});
