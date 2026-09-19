// VGRP-49 — tests unitarios (mockeados, sin Postgres real) de GET /api/agentes.
// Mismo estilo que app/api/admin/usuarios/[id]/nivel/route.test.ts: vi.mock de
// las dependencias + import dinámico del módulo bajo test. Complementa a
// test/integration/agentes-route.test.ts (handler real contra Supabase real,
// sólo getVerifiedClaims mockeado) — acá el foco es específicamente la rama de
// error, que no se puede forzar de forma determinística contra la base real.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mockGetVerifiedClaims = vi.fn();
const mockObtenerAgentesCacheados = vi.fn();
const mockCaptureException = vi.fn();

vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

// VGRP-55 punto 1 — la ruta ahora llama a obtenerAgentesCacheados(claims), no
// a obtenerAgentes(admin, claims): ya no arma su propio admin client (la
// versión cacheada crea el suyo adentro, ver lib/data/agentes.ts).
vi.mock("@/lib/data/agentes", () => ({
  obtenerAgentesCacheados: (...args: unknown[]) => mockObtenerAgentesCacheados(...args),
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

async function call() {
  const { GET } = await import("./route");
  return GET();
}

describe("GET /api/agentes", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockObtenerAgentesCacheados.mockReset();
    mockCaptureException.mockReset();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("nivelActual sale de getNivel(claims) — el mismo claims que se le pasa a obtenerAgentesCacheados, nunca de otro lado", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "principiante" } });
    mockObtenerAgentesCacheados.mockResolvedValue([]);

    const res = await call();
    const body = await res.json();

    expect(body.nivelActual).toBe("principiante");
    expect(mockObtenerAgentesCacheados).toHaveBeenCalledWith({
      app_metadata: { nivel: "principiante" },
    });
  });

  it("sin sesión (claims=null): nivelActual='ninguno' y obtenerAgentesCacheados se llama con claims=null (nunca lanza)", async () => {
    mockGetVerifiedClaims.mockResolvedValue(null);
    mockObtenerAgentesCacheados.mockResolvedValue([]);

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(200);
    expect(body.nivelActual).toBe("ninguno");
    expect(mockObtenerAgentesCacheados).toHaveBeenCalledWith(null);
  });

  it("GET() no declara parámetros: no existe ningún query param/header/body que pueda alcanzar el cálculo de nivel — la única fuente es getVerifiedClaims()", async () => {
    // Llamar con argumentos extra (como si alguien intentara colarle un
    // Request con ?nivel=avanzado) no cambia nada: la firma real de GET no
    // los declara, así que en runtime se ignoran por completo. Lo único que
    // decide la respuesta es lo que devuelve el mock de getVerifiedClaims.
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "principiante" } });
    mockObtenerAgentesCacheados.mockResolvedValue([
      {
        id: "a1",
        publicMeta: { nombre: "x", especialidad: "y", nivelRequerido: "avanzado" },
        contacto: null,
      },
    ]);

    const { GET } = await import("./route");
    const requestConNivelInyectado = new Request(
      "https://ogcircle.example/api/agentes?nivel=avanzado",
      { headers: { "x-nivel-forzado": "avanzado" } },
    );
    // biome-ignore lint/suspicious/noExplicitAny: GET real no acepta argumentos; se fuerza a mano para probar que, aunque se le pasen, no hacen nada.
    const res = await (GET as any)(requestConNivelInyectado, { nivel: "avanzado" });
    const body = await res.json();

    expect(body.nivelActual).toBe("principiante");
    expect(body.agentes[0].contacto).toBeNull();
  });

  it("si obtenerAgentesCacheados tira (Postgres real o cualquier otra falla), la respuesta es 500 genérica y NUNCA el mensaje crudo de la excepción", async () => {
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "avanzado" } });
    const errorCrudoDePostgres = new Error(
      'column "contacto_secreto_interno" does not exist — detalle interno de schema',
    );
    mockObtenerAgentesCacheados.mockRejectedValue(errorCrudoDePostgres);

    const res = await call();
    const body = await res.json();

    expect(res.status).toBe(500);
    expect(JSON.stringify(body)).not.toContain("contacto_secreto_interno");
    expect(JSON.stringify(body)).not.toContain(errorCrudoDePostgres.message);
    expect(body).toEqual({ error: expect.any(String) });
    expect(mockCaptureException).toHaveBeenCalledWith(
      errorCrudoDePostgres,
      expect.objectContaining({ extra: expect.objectContaining({ detalle: "obtenerAgentes" }) }),
    );
  });
});
