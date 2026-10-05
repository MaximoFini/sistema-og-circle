import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockCaptureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

describe("site-url", () => {
  const originalEnv = { ...process.env };

  beforeEach(() => {
    vi.resetModules();
    mockCaptureException.mockReset();
    vi.spyOn(console, "error").mockImplementation(() => {});
    delete process.env.NEXT_PUBLIC_SITE_URL;
    delete process.env.VERCEL_ENV;
  });

  afterEach(() => {
    process.env = { ...originalEnv };
    vi.restoreAllMocks();
  });

  it("getSiteUrl() devuelve NEXT_PUBLIC_SITE_URL cuando está seteada", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://ogcircle.example";
    const { getSiteUrl } = await import("./site-url");
    expect(getSiteUrl()).toBe("https://ogcircle.example");
  });

  it("getSiteUrl() cae a localhost fuera de producción", async () => {
    process.env.VERCEL_ENV = "preview";
    const { getSiteUrl } = await import("./site-url");
    expect(getSiteUrl()).toBe("http://localhost:3000");
  });

  it("getSiteUrl() en producción lanza si falta NEXT_PUBLIC_SITE_URL (no cae a localhost)", async () => {
    process.env.VERCEL_ENV = "production";
    const { getSiteUrl } = await import("./site-url");
    expect(() => getSiteUrl()).toThrow(/NEXT_PUBLIC_SITE_URL/);
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
  });

  it("getSiteUrlProduccion() en producción devuelve la URL si está seteada", async () => {
    process.env.VERCEL_ENV = "production";
    process.env.NEXT_PUBLIC_SITE_URL = "https://ogcircle.example";
    const { getSiteUrlProduccion } = await import("./site-url");
    expect(getSiteUrlProduccion()).toBe("https://ogcircle.example");
  });

  it("preferencia.ts re-exporta getSiteUrl (no se rompen imports existentes)", async () => {
    process.env.NEXT_PUBLIC_SITE_URL = "https://ogcircle.example";
    const { getSiteUrl: desdePreferencia } = await import("./mercadopago/preferencia");
    const { getSiteUrl } = await import("./site-url");
    expect(desdePreferencia).toBe(getSiteUrl);
  });
});
