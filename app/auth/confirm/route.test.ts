import { beforeEach, describe, expect, it, vi } from "vitest";

const mockVerifyOtp = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: { verifyOtp: (...args: unknown[]) => mockVerifyOtp(...args) },
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

function req(query: string): NextRequest {
  return new NextRequest(`https://ogcircle.example/auth/confirm?${query}`);
}

describe("GET /auth/confirm", () => {
  beforeEach(() => {
    mockVerifyOtp.mockReset();
  });

  it("recovery OK sin next va a la pantalla de nueva contraseña", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("token_hash=abc&type=recovery"));
    expect(mockVerifyOtp).toHaveBeenCalledWith({ type: "recovery", token_hash: "abc" });
    expect(res.headers.get("location")).toBe("https://ogcircle.example/recuperar/nueva");
  });

  it("signup OK sin next va al dashboard", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("token_hash=abc&type=signup"));
    expect(res.headers.get("location")).toBe("https://ogcircle.example/dashboard");
  });

  it("respeta un next relativo válido (no recovery)", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("token_hash=abc&type=signup&next=%2Fcomprar"));
    expect(res.headers.get("location")).toBe("https://ogcircle.example/comprar");
  });

  it("recovery ignora next: el hook lo manda como '/' y igual va a la contraseña nueva", async () => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req("token_hash=abc&type=recovery&next=%2F"));
    expect(res.headers.get("location")).toBe("https://ogcircle.example/recuperar/nueva");
  });

  it.each([
    ["host externo", "https%3A%2F%2Fevil.example"],
    ["protocol-relative", "%2F%2Fevil.example"],
    ["backslash", "%2F%5Cevil.example"],
  ])("ignora un next peligroso (%s) y cae al default", async (_nombre, next) => {
    mockVerifyOtp.mockResolvedValue({ error: null });
    const res = await GET(req(`token_hash=abc&type=recovery&next=${next}`));
    expect(res.headers.get("location")).toBe("https://ogcircle.example/recuperar/nueva");
  });

  it("si verifyOtp falla redirige a /recuperar con error", async () => {
    mockVerifyOtp.mockResolvedValue({ error: { message: "otp_expired" } });
    const res = await GET(req("token_hash=abc&type=recovery"));
    expect(res.headers.get("location")).toBe(
      "https://ogcircle.example/recuperar?error=enlace-vencido",
    );
  });

  it("sin token_hash no llama a Supabase y redirige a /recuperar con error", async () => {
    const res = await GET(req("type=recovery"));
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(
      "https://ogcircle.example/recuperar?error=enlace-invalido",
    );
  });

  it("un type desconocido no llama a Supabase", async () => {
    const res = await GET(req("token_hash=abc&type=otra-cosa"));
    expect(mockVerifyOtp).not.toHaveBeenCalled();
    expect(res.headers.get("location")).toBe(
      "https://ogcircle.example/recuperar?error=enlace-invalido",
    );
  });
});
