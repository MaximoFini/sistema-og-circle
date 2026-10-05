// VGRP-26 — test de `notificarPagoAprobado()` (lib/email/pago-aprobado.ts).
//
// Propiedades que importan:
// - Busca email/nombre en `profiles` con service role y envía vía `enviarEmail`
//   con la referencia (paymentId) y la URL del dashboard.
// - NUNCA lanza, aunque falle la búsqueda del perfil o el envío (el webhook la
//   llama sin await y su 200 no puede depender de esto).

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockEnviarEmail = vi.fn();
const mockReportar = vi.fn();
const mockMaybeSingle = vi.fn();

vi.mock("./send", () => ({
  enviarEmail: (...args: unknown[]) => mockEnviarEmail(...args),
  reportarFalloDeEmail: (...args: unknown[]) => mockReportar(...args),
}));

vi.mock("../supabase/service-role", () => ({
  createServiceRoleClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: () => mockMaybeSingle() }),
      }),
    }),
  }),
}));

vi.mock("../../emails/pago-confirmado", () => ({
  PagoConfirmadoEmail: (props: unknown) => ({ tipo: "pago-confirmado", props }),
}));

const DATOS = {
  userId: "user-123",
  nivel: "completo" as const,
  montoArs: 90000,
  referencia: "pay-999",
};

describe("notificarPagoAprobado", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.NEXT_PUBLIC_SITE_URL = "https://ogcircle.example";
  });

  it("envía el email de confirmación al email del perfil con referencia y URL del dashboard", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { email: "ana@example.com", nombre: "Ana" },
      error: null,
    });
    mockEnviarEmail.mockResolvedValue({ ok: true, id: "re_1" });

    const { notificarPagoAprobado } = await import("./pago-aprobado");
    await notificarPagoAprobado(DATOS);

    expect(mockEnviarEmail).toHaveBeenCalledTimes(1);
    const arg = mockEnviarEmail.mock.calls[0][0];
    expect(arg.para).toBe("ana@example.com");
    expect(arg.motivo).toBe("pago-confirmado");
    expect(arg.plantilla.props).toEqual({
      nombre: "Ana",
      montoArs: 90000,
      referencia: "pay-999",
      url: "https://ogcircle.example/dashboard",
    });
  });

  it("no envía ni lanza si el perfil no existe", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: null });

    const { notificarPagoAprobado } = await import("./pago-aprobado");
    await expect(notificarPagoAprobado(DATOS)).resolves.toBeUndefined();

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockReportar).toHaveBeenCalledWith("pago-confirmado", expect.any(String));
  });

  it("no lanza si la búsqueda del perfil devuelve error", async () => {
    mockMaybeSingle.mockResolvedValue({ data: null, error: new Error("db caída") });

    const { notificarPagoAprobado } = await import("./pago-aprobado");
    await expect(notificarPagoAprobado(DATOS)).resolves.toBeUndefined();

    expect(mockEnviarEmail).not.toHaveBeenCalled();
    expect(mockReportar).toHaveBeenCalled();
  });

  it("no lanza si la búsqueda del perfil tira una excepción", async () => {
    mockMaybeSingle.mockRejectedValue(new Error("red caída"));

    const { notificarPagoAprobado } = await import("./pago-aprobado");
    await expect(notificarPagoAprobado(DATOS)).resolves.toBeUndefined();
    expect(mockReportar).toHaveBeenCalled();
  });

  it("no lanza si enviarEmail devuelve ok:false", async () => {
    mockMaybeSingle.mockResolvedValue({
      data: { email: "ana@example.com", nombre: null },
      error: null,
    });
    mockEnviarEmail.mockResolvedValue({ ok: false, error: "503" });

    const { notificarPagoAprobado } = await import("./pago-aprobado");
    await expect(notificarPagoAprobado(DATOS)).resolves.toBeUndefined();
  });
});
