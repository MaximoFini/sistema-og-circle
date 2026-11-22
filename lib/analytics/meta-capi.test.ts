import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const captureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...a: unknown[]) => captureException(...a),
}));

import { enviarEventoMeta, hashearSha256, normalizarEmail, normalizarTelefono } from "./meta-capi";

const fetchMock = vi.fn();

beforeEach(() => {
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockResolvedValue({ ok: true, status: 200 });
  vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "123456");
  vi.stubEnv("META_CAPI_TOKEN", "tok_secreto");
  vi.stubEnv("META_TEST_EVENT_CODE", "");
});

afterEach(() => {
  vi.unstubAllEnvs();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const evento = {
  eventName: "Purchase",
  eventId: "pago_1",
  email: "  Test@Example.com ",
  telefono: "011 5555-1234",
};

describe("hash y normalización", () => {
  it("SHA-256 con vectores conocidos", () => {
    expect(hashearSha256("test@example.com")).toBe(
      "973dfe463ec85785f5f95af5ba3906eedb2d931c24e69824a89ea65dba4e813b",
    );
    expect(hashearSha256("")).toBe(
      "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    );
  });

  it("normaliza email y teléfono", () => {
    expect(normalizarEmail("  Test@Example.com ")).toBe("test@example.com");
    expect(normalizarTelefono("011 5555-1234")).toBe("541155551234");
    expect(normalizarTelefono("+54 9 351 555 1234")).toBe("5493515551234");
    expect(normalizarTelefono("abc")).toBe("");
  });
});

describe("enviarEventoMeta", () => {
  it("es no-op sin pixel id o sin token", async () => {
    vi.stubEnv("META_CAPI_TOKEN", "");
    await enviarEventoMeta(evento);
    vi.stubEnv("META_CAPI_TOKEN", "tok");
    vi.stubEnv("NEXT_PUBLIC_META_PIXEL_ID", "");
    await enviarEventoMeta(evento);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("manda el evento hasheado, sin email ni teléfono en claro", async () => {
    await enviarEventoMeta({ ...evento, userAgent: "UA", fbp: "fb.1.2" });
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toBe("https://graph.facebook.com/v21.0/123456/events?access_token=tok_secreto");
    const raw = init.body as string;
    expect(raw).not.toContain("example.com");
    expect(raw).not.toContain("5555");
    const parsed = JSON.parse(raw);
    const [e] = parsed.data;
    expect(e.action_source).toBe("website");
    expect(e.event_id).toBe("pago_1");
    expect(e.user_data.em).toEqual([hashearSha256("test@example.com")]);
    expect(e.user_data.ph).toEqual([hashearSha256("541155551234")]);
    expect(e.user_data.client_user_agent).toBe("UA");
    expect(e.user_data.fbp).toBe("fb.1.2");
    expect(parsed.test_event_code).toBeUndefined();
  });

  it("incluye test_event_code si existe", async () => {
    vi.stubEnv("META_TEST_EVENT_CODE", "TEST123");
    await enviarEventoMeta(evento);
    expect(JSON.parse(fetchMock.mock.calls[0][1].body).test_event_code).toBe("TEST123");
  });

  it("un error de red no propaga y va a Sentry", async () => {
    fetchMock.mockRejectedValue(new Error("red caída"));
    await expect(enviarEventoMeta(evento)).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
  });

  it("un 5xx no propaga y va a Sentry sin filtrar el token", async () => {
    fetchMock.mockResolvedValue({ ok: false, status: 503 });
    await expect(enviarEventoMeta(evento)).resolves.toBeUndefined();
    expect(captureException).toHaveBeenCalledTimes(1);
    expect(String(captureException.mock.calls[0][0])).not.toContain("tok_secreto");
  });
});
