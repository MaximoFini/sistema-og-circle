// VGRP-46 — tests de `crearCheckout` y `consultarNivelActual` (VGRP-22).
//
// Mismo estilo que `app/api/webhooks/mercadopago/route.test.ts`: `vi.mock()`
// de los cuatro módulos de los que depende `_actions.ts`
// (`@/lib/auth/server`, `@/lib/auth/claims`, `@/lib/mercadopago/preferencia`,
// `@/lib/mercadopago/client`, más `@vercel/analytics/server`) + funciones
// espía, `vi.resetModules()` en `beforeEach` e import dinámico del módulo
// bajo test dentro de cada test. Sin red real, sin Supabase real: todo lo que
// hablaría con Mercado Pago o con Supabase Auth está mockeado.

import { beforeEach, describe, expect, it, vi } from "vitest";
import type { NivelAcceso } from "@/lib/database.types";

const mockGetVerifiedClaims = vi.fn();
const mockGetNivel = vi.fn();
const mockArmarPreferencia = vi.fn();
const mockGetPreferenceClient = vi.fn();
const mockCreate = vi.fn();
const mockTrack = vi.fn();
// VGRP-78 — `profiles.telefono`: lo que devuelve el SELECT y lo que recibe el UPDATE.
const mockLeerPerfil = vi.fn();
const mockActualizarPerfil = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
  createSupabaseServerClient: async () => ({
    from: () => ({
      select: () => ({ eq: () => ({ single: () => mockLeerPerfil() }) }),
      update: (valores: unknown) => ({ eq: () => mockActualizarPerfil(valores) }),
    }),
  }),
}));

vi.mock("@/lib/auth/claims", async (importOriginal) => {
  // `nivelAlcanzaOSupera` NO se mockea: es lógica de negocio pura (el orden
  // ninguno < completo) que ya tiene su propia suite en
  // `lib/auth/claims.test.ts` — acá corre con su implementación real, sólo
  // alimentada por el `getNivel` mockeado. Sólo `getNivel` necesita mock
  // (lee claims, que este archivo ya simula con `CLAIMS_OK`).
  const actual = await importOriginal<typeof import("@/lib/auth/claims")>();
  return {
    ...actual,
    getNivel: (...args: unknown[]) => mockGetNivel(...args),
  };
});

vi.mock("@/lib/mercadopago/preferencia", () => ({
  armarPreferencia: (...args: unknown[]) => mockArmarPreferencia(...args),
}));

vi.mock("@/lib/mercadopago/client", () => ({
  getPreferenceClient: () => mockGetPreferenceClient(),
}));

vi.mock("@vercel/analytics/server", () => ({
  track: (...args: unknown[]) => mockTrack(...args),
}));

const CLAIMS_OK = { sub: "user-123", app_metadata: { nivel: "ninguno" } };

const PREFERENCIA_OK = {
  ok: true as const,
  preferenceData: {
    items: [{ id: "completo", title: "Nivel Completo", quantity: 1, unit_price: 75000 }],
    external_reference: "user-123",
    metadata: { nivel: "completo" },
  },
};

describe("crearCheckout", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockGetNivel.mockReset();
    mockArmarPreferencia.mockReset();
    mockGetPreferenceClient.mockReset();
    mockCreate.mockReset();
    mockTrack.mockReset();
    mockLeerPerfil.mockReset();
    mockActualizarPerfil.mockReset();

    mockGetVerifiedClaims.mockResolvedValue(CLAIMS_OK);
    // Default: el perfil ya tiene teléfono (el caso de siempre, registro con email).
    mockLeerPerfil.mockResolvedValue({ data: { telefono: "+54 9 351 555-0000" }, error: null });
    mockActualizarPerfil.mockResolvedValue({ error: null });
    // Auditoría de Mercado Pago: crearCheckout ahora también llama a
    // getNivel(claims) para bloquear la recompra de un nivel ya alcanzado.
    // Default 'ninguno' — ningún nivel comprable queda bloqueado de arranque.
    mockGetNivel.mockReturnValue("ninguno" satisfies NivelAcceso);
    mockArmarPreferencia.mockResolvedValue(PREFERENCIA_OK);
    mockGetPreferenceClient.mockReturnValue({ create: mockCreate });
    mockCreate.mockResolvedValue({ init_point: "https://mp.example/checkout/pref-1" });
    mockTrack.mockResolvedValue(undefined);
  });

  it("sin sesión (getVerifiedClaims null) devuelve ok:false y nunca arma la preferencia ni crea el checkout", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);

    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("completo");

    expect(result.ok).toBe(false);
    expect(mockArmarPreferencia).not.toHaveBeenCalled();
    expect(mockGetPreferenceClient).not.toHaveBeenCalled();
    expect(mockCreate).not.toHaveBeenCalled();
  });

  it("nivel 'ninguno' se rechaza antes de armar la preferencia", async () => {
    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("ninguno");

    expect(result.ok).toBe(false);
    expect(mockArmarPreferencia).not.toHaveBeenCalled();
    expect(mockGetPreferenceClient).not.toHaveBeenCalled();
  });

  it("claims sin 'sub' (ausente) devuelve error explícito y no arma la preferencia", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("completo");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería ser ok:true");
    expect(typeof result.error).toBe("string");
    expect(mockArmarPreferencia).not.toHaveBeenCalled();
  });

  it("claims con 'sub' no-string devuelve error explícito y no arma la preferencia", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ sub: 12345, app_metadata: { nivel: "ninguno" } });

    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("completo");

    expect(result.ok).toBe(false);
    expect(mockArmarPreferencia).not.toHaveBeenCalled();
  });

  it("propaga tal cual el error de armarPreferencia y nunca llega a crear el checkout en MP", async () => {
    mockArmarPreferencia.mockResolvedValue({
      ok: false,
      error: "precios inválidos o no disponibles en Edge Config",
    });

    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("completo");

    expect(result).toEqual({
      ok: false,
      error: "precios inválidos o no disponibles en Edge Config",
    });
    expect(mockGetPreferenceClient).not.toHaveBeenCalled();
  });

  it("si getPreferenceClient().create() rechaza, el Server Action no deja escapar la excepción y devuelve ok:false genérico", async () => {
    mockCreate.mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("completo");

    expect(result.ok).toBe(false);
    if (result.ok) throw new Error("no debería ser ok:true");
    expect(typeof result.error).toBe("string");
  });

  it("si la respuesta de create() no tiene init_point ni sandbox_init_point, devuelve error controlado", async () => {
    mockCreate.mockResolvedValue({});

    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("completo");

    expect(result.ok).toBe(false);
  });

  it("happy path: devuelve ok:true con la url de init_point y llama a track('checkout_iniciado', {nivel}) una vez", async () => {
    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("completo");

    expect(result).toEqual({ ok: true, url: "https://mp.example/checkout/pref-1" });
    // Perfil con teléfono ya cargado (default): no se escribe nada (VGRP-78).
    expect(mockActualizarPerfil).not.toHaveBeenCalled();
    expect(mockTrack).toHaveBeenCalledTimes(1);
    expect(mockTrack).toHaveBeenCalledWith("checkout_iniciado", { nivel: "completo" });
  });

  it("si track() tira una excepción, el checkout igual devuelve ok:true (fail-open)", async () => {
    mockTrack.mockRejectedValue(new Error("analytics caído"));

    const { crearCheckout } = await import("./_actions");
    const result = await crearCheckout("completo");

    expect(result).toEqual({ ok: true, url: "https://mp.example/checkout/pref-1" });
  });

  // Auditoría de Mercado Pago (decisión del equipo): bloquear la recompra
  // del plan a quien ya lo tiene.
  describe("bloqueo de recompra del plan", () => {
    it("un usuario 'completo' no puede volver a comprar el plan", async () => {
      mockGetNivel.mockReturnValue("completo" satisfies NivelAcceso);

      const { crearCheckout } = await import("./_actions");
      const result = await crearCheckout("completo");

      expect(result.ok).toBe(false);
      expect(mockArmarPreferencia).not.toHaveBeenCalled();
      expect(mockGetPreferenceClient).not.toHaveBeenCalled();
    });

    it("un usuario 'ninguno' SÍ puede comprar el plan", async () => {
      mockGetNivel.mockReturnValue("ninguno" satisfies NivelAcceso);

      const { crearCheckout } = await import("./_actions");
      const result = await crearCheckout("completo");

      expect(result.ok).toBe(true);
      expect(mockArmarPreferencia).toHaveBeenCalledWith("completo", "user-123");
    });
  });

  // VGRP-78 — quien se registró con Google no tiene teléfono: se pide al pagar.
  describe("teléfono obligatorio", () => {
    beforeEach(() => {
      mockLeerPerfil.mockResolvedValue({ data: { telefono: null }, error: null });
    });

    it("perfil sin teléfono y sin input: error en el campo y no se crea la preferencia", async () => {
      const { crearCheckout } = await import("./_actions");
      const result = await crearCheckout("completo");

      expect(result).toEqual({
        ok: false,
        error: "Ingresá un teléfono de contacto.",
        campo: "telefono",
      });
      expect(mockActualizarPerfil).not.toHaveBeenCalled();
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("perfil con teléfono en blanco cuenta como vacío", async () => {
      mockLeerPerfil.mockResolvedValue({ data: { telefono: "   " }, error: null });

      const { crearCheckout } = await import("./_actions");
      const result = await crearCheckout("completo");

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it.each([
      ["muy corto", "12345"],
      ["sólo espacios", "        "],
      ["muy largo", "1".repeat(31)],
    ])(
      "teléfono inválido (%s): error en el campo, no se guarda ni se crea la preferencia",
      async (_caso, telefono) => {
        const { crearCheckout } = await import("./_actions");
        const result = await crearCheckout("completo", telefono);

        expect(result).toMatchObject({ ok: false, campo: "telefono" });
        expect(mockActualizarPerfil).not.toHaveBeenCalled();
        expect(mockCreate).not.toHaveBeenCalled();
      },
    );

    it("teléfono válido: se guarda (recortado) en profiles y después se crea la preferencia", async () => {
      const { crearCheckout } = await import("./_actions");
      const result = await crearCheckout("completo", "  +54 9 351 555-1234  ");

      expect(result).toEqual({ ok: true, url: "https://mp.example/checkout/pref-1" });
      expect(mockActualizarPerfil).toHaveBeenCalledWith({ telefono: "+54 9 351 555-1234" });
      expect(mockActualizarPerfil.mock.invocationCallOrder[0]).toBeLessThan(
        mockCreate.mock.invocationCallOrder[0],
      );
    });

    it("si falla el guardado del teléfono, no se crea la preferencia", async () => {
      mockActualizarPerfil.mockResolvedValue({ error: { message: "rls" } });

      const { crearCheckout } = await import("./_actions");
      const result = await crearCheckout("completo", "+54 9 351 555-1234");

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });

    it("si no se puede leer el perfil, falla cerrado y no crea la preferencia", async () => {
      mockLeerPerfil.mockResolvedValue({ data: null, error: { message: "timeout" } });

      const { crearCheckout } = await import("./_actions");
      const result = await crearCheckout("completo");

      expect(result.ok).toBe(false);
      expect(mockCreate).not.toHaveBeenCalled();
    });
  });
});

describe("consultarNivelActual", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockGetNivel.mockReset();
  });

  it("devuelve el nivel que resuelve getNivel(claims) cuando hay sesión", async () => {
    mockGetVerifiedClaims.mockResolvedValue(CLAIMS_OK);
    mockGetNivel.mockReturnValue("completo" satisfies NivelAcceso);

    const { consultarNivelActual } = await import("./_actions");
    const result = await consultarNivelActual();

    expect(result).toEqual({ nivel: "completo" });
    expect(mockGetNivel).toHaveBeenCalledWith(CLAIMS_OK);
  });

  it("sin claims (null) devuelve nivel 'ninguno'", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);
    mockGetNivel.mockReturnValue("ninguno" satisfies NivelAcceso);

    const { consultarNivelActual } = await import("./_actions");
    const result = await consultarNivelActual();

    expect(result).toEqual({ nivel: "ninguno" });
    expect(mockGetNivel).toHaveBeenCalledWith(null);
  });
});
