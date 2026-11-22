import { describe, expect, it } from "vitest";
import { esInternoCookie, leerDistinctId, nombreCookiePostHog } from "./cookies";

describe("leerDistinctId", () => {
  it("lee el distinct_id de una cookie url-encoded", () => {
    const v = encodeURIComponent(JSON.stringify({ distinct_id: "abc-123", sesion: [1] }));
    expect(leerDistinctId(v)).toBe("abc-123");
  });

  it("lee el distinct_id de un JSON sin encodear", () => {
    expect(leerDistinctId('{"distinct_id":"xyz"}')).toBe("xyz");
  });

  it.each([undefined, null, ""])("ausente (%j) → null", (v) => {
    expect(leerDistinctId(v)).toBeNull();
  });

  it.each([
    "no-es-json",
    "%E0%A4%A",
    "{",
    "[]",
    "null",
    '{"distinct_id":42}',
    '{"distinct_id":" "}',
  ])("corrupta (%s) → null", (v) => {
    expect(leerDistinctId(v)).toBeNull();
  });
});

describe("esInternoCookie / nombreCookiePostHog", () => {
  it("solo '1' es interno", () => {
    expect(esInternoCookie("1")).toBe(true);
    expect(esInternoCookie("0")).toBe(false);
    expect(esInternoCookie(undefined)).toBe(false);
  });

  it("arma el nombre de la cookie de PostHog", () => {
    expect(nombreCookiePostHog("phc_x")).toBe("ph_phc_x_posthog");
  });
});
