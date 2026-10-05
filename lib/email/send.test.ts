import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lo único que se testea acá es la promesa central del helper: `enviarEmail()`
 * NUNCA lanza, pase lo que pase con Resend. Es la propiedad de la que va a
 * depender el webhook de MercadoPago en el Bloque 3 (si el email falla, el pago
 * igual se procesa), así que si algún día se rompe, tiene que romperse un test.
 *
 * Resend tiene dos modos de falla distintos y los dos están cubiertos:
 * devolver `{ error }` en el body, y lanzar de verdad (red caída).
 */

const mockSend = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("resend", () => ({
  Resend: class {
    emails = { send: mockSend };
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// Elemento de React de mentira: `enviarEmail` solo se lo pasa a Resend, no lo
// renderiza, así que no hace falta una plantilla real (ni JSX en este archivo).
const PLANTILLA = { type: "div", props: {}, key: null } as never;

describe("enviarEmail", () => {
  beforeEach(() => {
    // Módulo fresco por test: `lib/email/client.ts` cachea el cliente de Resend
    // en scope de módulo, así que sin esto un test heredaría el cliente del
    // anterior. Ver el mismo comentario en route.test.ts.
    vi.resetModules();
    mockSend.mockReset();
    mockCaptureException.mockReset();
    vi.stubEnv("RESEND_API_KEY", "re_clave_de_prueba");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
  });

  it("devuelve ok:false sin lanzar cuando Resend responde con error en el body", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: "validation_error", message: "domain is not verified" },
    });

    const { enviarEmail } = await import("./send");
    const resultado = await enviarEmail({
      para: "alguien@ejemplo.com",
      asunto: "hola",
      plantilla: PLANTILLA,
      motivo: "test",
    });

    expect(resultado.ok).toBe(false);
    if (resultado.ok) throw new Error("no debería ser ok");
    expect(resultado.error).toContain("domain is not verified");
  });

  it("devuelve ok:false sin lanzar cuando el fetch de Resend explota (red caída)", async () => {
    mockSend.mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    const { enviarEmail } = await import("./send");

    // La promesa se resuelve, no se rechaza: el caller nunca ve la excepción.
    await expect(
      enviarEmail({
        para: "alguien@ejemplo.com",
        asunto: "hola",
        plantilla: PLANTILLA,
        motivo: "test",
      }),
    ).resolves.toEqual({ ok: false, error: "fetch failed: ECONNREFUSED" });
  });

  it("devuelve ok:false sin intentar enviar cuando falta RESEND_API_KEY", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    const { enviarEmail } = await import("./send");
    const resultado = await enviarEmail({
      para: "alguien@ejemplo.com",
      asunto: "hola",
      plantilla: PLANTILLA,
      motivo: "test",
    });

    expect(resultado.ok).toBe(false);
    expect(mockSend).not.toHaveBeenCalled();
  });

  it("devuelve ok:true con el id cuando el envío sale bien", async () => {
    mockSend.mockResolvedValue({ data: { id: "abc-123" }, error: null });

    const { enviarEmail } = await import("./send");
    const resultado = await enviarEmail({
      para: "alguien@ejemplo.com",
      asunto: "hola",
      plantilla: PLANTILLA,
      motivo: "test",
    });

    expect(resultado).toEqual({ ok: true, id: "abc-123" });
  });

  it("usa la API key nueva si RESEND_API_KEY rota en el proceso", async () => {
    const construidoCon: string[] = [];
    vi.doMock("resend", () => ({
      Resend: class {
        emails = { send: mockSend };
        constructor(apiKey: string) {
          construidoCon.push(apiKey);
        }
      },
    }));
    vi.resetModules();
    mockSend.mockResolvedValue({ data: { id: "x" }, error: null });

    const { enviarEmail } = await import("./send");
    const args = {
      para: "alguien@ejemplo.com",
      asunto: "hola",
      plantilla: PLANTILLA,
      motivo: "test",
    };

    vi.stubEnv("RESEND_API_KEY", "re_clave_vieja");
    await enviarEmail(args);
    await enviarEmail(args); // misma key: reusa el cliente cacheado
    vi.stubEnv("RESEND_API_KEY", "re_clave_nueva");
    await enviarEmail(args);

    expect(construidoCon).toEqual(["re_clave_vieja", "re_clave_nueva"]);

    // Restaura el mock de arriba: `doUnmock` dejaría a los tests siguientes con el
    // SDK real de Resend.
    vi.doMock("resend", () => ({
      Resend: class {
        emails = { send: mockSend };
      },
    }));
    vi.resetModules();
  });

  it("reporta a Sentry con tag motivo cuando Resend responde con error en el body", async () => {
    mockSend.mockResolvedValue({
      data: null,
      error: { name: "rate_limit_exceeded", message: "too many requests" },
    });

    const { enviarEmail } = await import("./send");
    await enviarEmail({
      para: "alguien@ejemplo.com",
      asunto: "hola",
      plantilla: PLANTILLA,
      motivo: "reset-password",
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [error, contexto] = mockCaptureException.mock.calls[0];
    expect(error).toBeInstanceOf(Error);
    expect((error as Error).message).toContain("too many requests");
    expect(contexto).toEqual({ tags: { motivo: "reset-password" } });
  });

  it("reporta a Sentry una excepción de red como Error normalizado", async () => {
    mockSend.mockRejectedValue(new Error("fetch failed: ECONNREFUSED"));

    const { enviarEmail } = await import("./send");
    await enviarEmail({
      para: "alguien@ejemplo.com",
      asunto: "hola",
      plantilla: PLANTILLA,
      motivo: "reset-password",
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect(mockCaptureException.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(mockCaptureException.mock.calls[0][1]).toEqual({
      tags: { motivo: "reset-password" },
    });
  });

  it("reporta a Sentry cuando falta RESEND_API_KEY", async () => {
    vi.stubEnv("RESEND_API_KEY", "");

    const { enviarEmail } = await import("./send");
    await enviarEmail({
      para: "alguien@ejemplo.com",
      asunto: "hola",
      plantilla: PLANTILLA,
      motivo: "reset-password",
    });

    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    expect((mockCaptureException.mock.calls[0][0] as Error).message).toContain("RESEND_API_KEY");
    expect(mockCaptureException.mock.calls[0][1]).toEqual({
      tags: { motivo: "reset-password" },
    });
  });

  it("si Sentry lanza, enviarEmail igual resuelve con ok:false y no propaga", async () => {
    mockSend.mockRejectedValue(new Error("fetch failed"));
    mockCaptureException.mockImplementation(() => {
      throw new Error("sentry roto");
    });

    const { enviarEmail } = await import("./send");

    await expect(
      enviarEmail({
        para: "alguien@ejemplo.com",
        asunto: "hola",
        plantilla: PLANTILLA,
        motivo: "test",
      }),
    ).resolves.toEqual({ ok: false, error: "fetch failed" });
  });
});
