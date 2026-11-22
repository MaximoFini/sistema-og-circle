import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

const { captureException, captureImmediate, aliasImmediate, identifyImmediate, ctor } = vi.hoisted(
  () => ({
    captureException: vi.fn(),
    captureImmediate: vi.fn(),
    aliasImmediate: vi.fn(),
    identifyImmediate: vi.fn(),
    ctor: vi.fn(),
  }),
);

vi.mock("@sentry/nextjs", () => ({ captureException }));
vi.mock("posthog-node", () => ({
  PostHog: class {
    captureImmediate = captureImmediate;
    aliasImmediate = aliasImmediate;
    identifyImmediate = identifyImmediate;
    constructor(...args: unknown[]) {
      ctor(...args);
    }
  },
}));

import { capturarServidor, marcarInterno, unirVisitante } from "./server";

beforeEach(() => {
  vi.clearAllMocks();
  captureException.mockReset();
  captureImmediate.mockResolvedValue(undefined);
  aliasImmediate.mockResolvedValue(undefined);
  identifyImmediate.mockResolvedValue(undefined);
});

afterEach(() => {
  vi.unstubAllEnvs();
});

describe("sin NEXT_PUBLIC_POSTHOG_KEY", () => {
  it("es no-op total: no crea cliente ni manda nada", async () => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "");
    await capturarServidor("u1", "evento");
    await unirVisitante("anon", "u1");
    await marcarInterno("u1");
    expect(ctor).not.toHaveBeenCalled();
    expect(captureImmediate).not.toHaveBeenCalled();
    expect(aliasImmediate).not.toHaveBeenCalled();
    expect(identifyImmediate).not.toHaveBeenCalled();
  });
});

describe("con clave", () => {
  beforeEach(() => {
    vi.stubEnv("NEXT_PUBLIC_POSTHOG_KEY", "phc_test");
  });

  it("capturarServidor manda el evento al host US", async () => {
    await capturarServidor("u1", "registro_completado", { metodo: "email" });
    expect(ctor).toHaveBeenCalledWith(
      "phc_test",
      expect.objectContaining({ host: "https://us.i.posthog.com" }),
    );
    expect(captureImmediate).toHaveBeenCalledWith({
      distinctId: "u1",
      event: "registro_completado",
      properties: { metodo: "email" },
    });
  });

  it("unirVisitante hace alias del anónimo al user.id", async () => {
    await unirVisitante("anon-1", "u1");
    expect(aliasImmediate).toHaveBeenCalledWith({ distinctId: "u1", alias: "anon-1" });
  });

  it("unirVisitante ignora un anónimo vacío o igual al user.id", async () => {
    await unirVisitante("", "u1");
    await unirVisitante("u1", "u1");
    expect(aliasImmediate).not.toHaveBeenCalled();
  });

  it("marcarInterno setea es_interno = true", async () => {
    await marcarInterno("u1");
    expect(identifyImmediate).toHaveBeenCalledWith({
      distinctId: "u1",
      properties: { es_interno: true },
    });
  });

  it("un error de red no propaga y va a Sentry", async () => {
    const error = new Error("fetch failed");
    captureImmediate.mockRejectedValue(error);
    aliasImmediate.mockRejectedValue(error);
    identifyImmediate.mockRejectedValue(error);
    await expect(capturarServidor("u1", "x")).resolves.toBeUndefined();
    await expect(unirVisitante("anon", "u1")).resolves.toBeUndefined();
    await expect(marcarInterno("u1")).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(3);
  });

  it("si Sentry también falla, igual no propaga", async () => {
    captureImmediate.mockRejectedValue(new Error("x"));
    captureException.mockImplementation(() => {
      throw new Error("sentry caído");
    });
    await expect(capturarServidor("u1", "x")).resolves.toBeUndefined();
  });
});
