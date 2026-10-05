import { beforeEach, describe, expect, it, vi } from "vitest";

const mockDispararBienvenida = vi.fn((_datos: unknown) => Promise.resolve());
vi.mock("@/lib/email/bienvenida", () => ({
  dispararBienvenida: (datos: unknown) => mockDispararBienvenida(datos),
}));

// `after()` sólo corre dentro de un request de Next; en el test se ejecuta en línea.
vi.mock("next/server", async (importOriginal) => ({
  ...(await importOriginal<typeof import("next/server")>()),
  after: (fn: () => unknown) => {
    void Promise.resolve()
      .then(fn)
      .catch(() => {});
  },
}));

vi.mock("@/lib/auth/origen-server", () => ({
  guardarOrigenSiFalta: vi.fn(() => Promise.resolve()),
}));

let perfilMock: Record<string, unknown> | null = null;
vi.mock("@/lib/auth/server", () => ({
  createSupabaseServerClient: async () => ({
    auth: {
      exchangeCodeForSession: async () => ({
        data: { user: { id: "u1", user_metadata: {} } },
        error: null,
      }),
    },
    from: () => ({
      select: () => ({
        eq: () => ({ maybeSingle: async () => ({ data: perfilMock, error: null }) }),
      }),
      update: () => ({ eq: async () => ({ error: null }) }),
    }),
  }),
}));

import { NextRequest } from "next/server";
import { GET } from "./route";

const PERFIL_BASE = {
  nombre: "Ana",
  email: "ana@example.com",
  terminos_aceptados_at: "2026-01-01T00:00:00Z",
};

function req(): NextRequest {
  return new NextRequest("https://ogcircle.example/auth/callback/google?code=c1&next=/dashboard");
}

describe("GET /auth/callback/google — bienvenida", () => {
  beforeEach(() => {
    mockDispararBienvenida.mockClear();
  });

  it("primer ingreso (bienvenida_enviada_at vacío) dispara la bienvenida", async () => {
    perfilMock = { ...PERFIL_BASE, bienvenida_enviada_at: null };
    await GET(req());
    expect(mockDispararBienvenida).toHaveBeenCalledWith({
      userId: "u1",
      email: "ana@example.com",
      nombre: "Ana",
    });
  });

  it("un segundo login (ya enviada) NO reenvía", async () => {
    perfilMock = { ...PERFIL_BASE, bienvenida_enviada_at: "2026-02-01T00:00:00Z" };
    await GET(req());
    expect(mockDispararBienvenida).not.toHaveBeenCalled();
  });
});
