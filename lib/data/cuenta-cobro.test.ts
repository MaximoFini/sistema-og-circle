// VGRP-62 — obtenerCuentaActiva: forma de lo que devuelve y comportamiento
// fail-closed. Unitario, con un cliente de Supabase simulado; la lectura contra
// la base real está en lib/data/admin/cuentas.test.ts.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockMaybeSingle = vi.fn();
const mockSelect = vi.fn();
const mockEq = vi.fn();
const mockCaptureException = vi.fn();

const cliente = {
  from: () => ({
    select: (...args: unknown[]) => {
      mockSelect(...args);
      return {
        eq: (...eqArgs: unknown[]) => {
          mockEq(...eqArgs);
          return { maybeSingle: () => mockMaybeSingle() };
        },
      };
    },
  }),
};

vi.mock("@/lib/supabase/service-role", () => ({ createServiceRoleClient: () => cliente }));
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

const FILA = {
  id: "c1",
  titular: "OG Circle SRL",
  cuit: "20123456786",
  banco: "Banco de prueba",
  cbu_cvu: "0000000000000000000001",
  alias: "og.circle.test",
  notas: null,
};

describe("obtenerCuentaActiva", () => {
  beforeEach(() => {
    for (const m of [mockMaybeSingle, mockSelect, mockEq, mockCaptureException]) m.mockReset();
  });

  it("devuelve la cuenta activa con los campos de CuentaCobroVisible", async () => {
    mockMaybeSingle.mockResolvedValue({ data: FILA, error: null });
    const { obtenerCuentaActiva } = await import("./cuenta-cobro");

    expect(await obtenerCuentaActiva()).toEqual({
      id: "c1",
      titular: "OG Circle SRL",
      cuit: "20123456786",
      banco: "Banco de prueba",
      cbuCvu: "0000000000000000000001",
      alias: "og.circle.test",
      notas: null,
    });
    expect(mockEq).toHaveBeenCalledWith("activa", true);
  });

  it("pide sólo las columnas visibles: nunca created_at/updated_at ni `activa`", async () => {
    mockMaybeSingle.mockResolvedValue({ data: FILA, error: null });
    const { obtenerCuentaActiva } = await import("./cuenta-cobro");

    await obtenerCuentaActiva();

    expect(mockSelect).toHaveBeenCalledWith("id, titular, cuit, banco, cbu_cvu, alias, notas");
  });

  it("devuelve null si no hay ninguna cuenta activa", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });
    const { obtenerCuentaActiva } = await import("./cuenta-cobro");

    expect(await obtenerCuentaActiva()).toBeNull();
    expect(mockCaptureException).not.toHaveBeenCalled();
  });

  it("fail-closed: ante un error de lectura devuelve null y avisa a Sentry", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error("db caída") });
    const { obtenerCuentaActiva } = await import("./cuenta-cobro");

    expect(await obtenerCuentaActiva()).toBeNull();
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });
});
