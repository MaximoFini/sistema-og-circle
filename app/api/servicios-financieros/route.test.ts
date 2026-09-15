// VGRP-52 — tests de integración de GET /api/servicios-financieros contra el proyecto
// real de Supabase (docs/TESTING.md). Mismo criterio que
// app/api/profesionales/route.test.ts: sólo se mockea `getVerifiedClaims`, el resto
// (createServiceRoleClient, obtenerServiciosFinancieros) es 100% real.
//
// `lib/data/servicios.test.ts` (VGRP-32) ya cubre la lógica de gating de
// `obtenerServiciosFinancieros()` en sí — acá el foco es el contrato HTTP de la ruta, y
// EL TEST MÁS IMPORTANTE de esta parte del ticket: que el nivel usado para gatear
// (incluido el dato SWIFT en `descripcion`) SIEMPRE sale del claim verificado, nunca de
// algo que un cliente pudiera mandar en el propio Request.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAG_POR_ENTIDAD } from "../../../lib/data/admin/contenido";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import "../../../test/helpers/load-env";

const mockGetVerifiedClaims = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

// No lo usa esta ruta (sólo la de admin/contenido la llama) — se mockea igual para el
// test de "revalidateTag es un no-op real" de más abajo, que lo invoca a propósito para
// dejar constancia de que da igual si se llama o no.
const mockRevalidateTag = vi.fn();
vi.mock("next/cache", () => ({
  revalidateTag: (...args: unknown[]) => mockRevalidateTag(...args),
}));

const admin = createTestAdminClient();
const idsCreados: string[] = [];

async function crearServicioTest(valores: {
  titulo: string;
  nivel_requerido: "ninguno" | "principiante" | "avanzado";
  descripcion?: string;
  activo?: boolean;
}) {
  const { data, error } = await admin
    .from("servicios_financieros")
    .insert({
      titulo: valores.titulo,
      descripcion: valores.descripcion ?? "descripcion-secreta-de-test",
      nivel_requerido: valores.nivel_requerido,
      activo: valores.activo ?? true,
      orden: 0,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

interface ServicioRespuesta {
  id: string;
  publicMeta: { titulo: string; nivelRequerido: string };
  descripcion: string | null;
}

describe("GET /api/servicios-financieros", () => {
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    mockRevalidateTag.mockReset();
  });

  afterEach(async () => {
    while (idsCreados.length > 0) {
      const id = idsCreados.pop() as string;
      await admin.from("servicios_financieros").delete().eq("id", id);
    }
  });

  it("sin sesión (claims null): 200, nivelActual:'ninguno' y descripcion:null en la fila gateada", async () => {
    const servicio = await crearServicioTest({
      titulo: "Sin sesión VGRP-52",
      nivel_requerido: "principiante",
    });
    mockGetVerifiedClaims.mockResolvedValue(null);

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as { servicios: ServicioRespuesta[]; nivelActual: string };
    expect(body.nivelActual).toBe("ninguno");
    const item = body.servicios.find((s) => s.id === servicio.id);
    expect(item?.descripcion).toBeNull();
  });

  it("sesión 'principiante' contra fila nivel_requerido='avanzado': descripcion null, publicMeta.titulo siempre presente", async () => {
    const servicio = await crearServicioTest({
      titulo: "SWIFT de prueba VGRP-52",
      nivel_requerido: "avanzado",
      descripcion: "IBAN-secreto-no-debe-salir",
    });
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "principiante" } });

    const { GET } = await import("./route");
    const res = await GET();
    const body = (await res.json()) as { servicios: ServicioRespuesta[]; nivelActual: string };
    expect(body.nivelActual).toBe("principiante");

    const item = body.servicios.find((s) => s.id === servicio.id);
    expect(item).toBeDefined();
    expect(item?.publicMeta.titulo).toBe("SWIFT de prueba VGRP-52");
    expect(item?.descripcion).toBeNull();
    expect(JSON.stringify(body)).not.toContain("IBAN-secreto-no-debe-salir");
  });

  it("sesión 'avanzado' contra la misma fila: descripcion real", async () => {
    const servicio = await crearServicioTest({
      titulo: "SWIFT de prueba avanzado VGRP-52",
      nivel_requerido: "avanzado",
      descripcion: "IBAN-secreto-avanzado",
    });
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "avanzado" } });

    const { GET } = await import("./route");
    const res = await GET();
    const body = (await res.json()) as { servicios: ServicioRespuesta[] };
    const item = body.servicios.find((s) => s.id === servicio.id);
    expect(item?.descripcion).toBe("IBAN-secreto-avanzado");
  });

  it("el nivel sale del claim verificado, NUNCA de query param/header/body del propio Request", async () => {
    const servicio = await crearServicioTest({
      titulo: "No debe filtrarse por query VGRP-52",
      nivel_requerido: "avanzado",
      descripcion: "IBAN-no-debe-salir-por-query",
    });
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "principiante" } });

    const reqEnvenenado = new Request(
      "https://ogcircle.example/api/servicios-financieros?nivel=avanzado",
      {
        headers: { "x-nivel": "avanzado", cookie: "nivel=avanzado" },
      },
    );

    const { GET } = await import("./route");
    // GET() no declara ningún parámetro — ni siquiera podría leer este Request. Se lo
    // pasamos igual para dejar en evidencia, con un test que fallaría si algún día
    // alguien "mejora" la firma para leer de la URL/headers/body, que eso NO cambia nada.
    const res = await (GET as (req: Request) => Promise<Response>)(reqEnvenenado);
    const body = (await res.json()) as { servicios: ServicioRespuesta[] };
    const item = body.servicios.find((s) => s.id === servicio.id);
    expect(item?.descripcion).toBeNull();
  });

  it("revalidateTag es un NO-OP real para esta entidad: el próximo GET ya ve el cambio del panel sin depender de él", async () => {
    const servicio = await crearServicioTest({
      titulo: "Título viejo VGRP-52",
      nivel_requerido: "ninguno",
    });

    // Simula lo que escribe el panel admin (PATCH
    // /api/admin/contenido/servicios_financieros/:id -> actualizarContenido()), sin
    // pasar por esa ruta HTTP completa.
    const { error } = await admin
      .from("servicios_financieros")
      .update({ titulo: "Título nuevo del panel VGRP-52" })
      .eq("id", servicio.id);
    expect(error).toBeNull();

    // El panel real llama a esto DESPUÉS de escribir (route.ts de admin/contenido) — lo
    // invocamos nosotros para dejar constancia de que, se llame o no, no tiene ningún
    // efecto acá: lib/data/servicios.ts no usa unstable_cache.
    mockRevalidateTag(TAG_POR_ENTIDAD.servicios_financieros);
    expect(mockRevalidateTag).toHaveBeenCalledWith("grilla-servicios");

    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "avanzado" } });
    const { GET } = await import("./route");
    const res = await GET();
    const body = (await res.json()) as { servicios: ServicioRespuesta[] };
    const item = body.servicios.find((s) => s.id === servicio.id);
    expect(item?.publicMeta.titulo).toBe("Título nuevo del panel VGRP-52");
  });
});
