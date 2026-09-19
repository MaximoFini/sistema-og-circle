// VGRP-52 — tests de integración de GET /api/servicios-financieros contra el proyecto
// real de Supabase (docs/TESTING.md). Se mockea `getVerifiedClaims` y (desde VGRP-55
// punto 1) `next/cache` (ver más abajo, por qué); el resto (createServiceRoleClient,
// obtenerServiciosFinancieros) es 100% real.
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

// VGRP-55 punto 1 — lib/data/servicios.ts ahora usa unstable_cache de verdad,
// así que este mock ya no puede limitarse a revalidateTag: necesita simular
// el comportamiento real (cachea por key+args, invalida por tag) para que el
// test de "revalidateTag" de más abajo pruebe algo real, no un no-op. No es
// una reimplementación completa de Next: alcanza para lo que este archivo
// necesita (una entrada por combinación de key+args, invalidación por tag).
vi.mock("next/cache", () => {
  const store = new Map<string, unknown>();
  const porTag = new Map<string, Set<string>>();

  return {
    unstable_cache: <A extends unknown[], R>(
      fn: (...args: A) => Promise<R>,
      keyParts: string[],
      options?: { tags?: string[] },
    ) => {
      return async (...args: A): Promise<R> => {
        const key = `${JSON.stringify(keyParts)}:${JSON.stringify(args)}`;
        if (store.has(key)) return store.get(key) as R;
        const resultado = await fn(...args);
        store.set(key, resultado);
        for (const tag of options?.tags ?? []) {
          if (!porTag.has(tag)) porTag.set(tag, new Set());
          porTag.get(tag)?.add(key);
        }
        return resultado;
      };
    },
    revalidateTag: (tag: string) => {
      for (const key of porTag.get(tag) ?? []) store.delete(key);
    },
  };
});

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
  beforeEach(async () => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    // El mock de next/cache de arriba vive en el closure del factory de
    // vi.mock, que Vitest NO re-ejecuta en cada resetModules() — el `store`
    // sobrevive entre tests de este archivo. Se invalida a mano acá para que
    // cada test arranque con caché fría, en vez de heredar filas de un test
    // anterior (ya borradas de la base por su propio afterEach).
    const { revalidateTag } = await import("next/cache");
    revalidateTag(TAG_POR_ENTIDAD.servicios_financieros);
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

  // VGRP-55 punto 1 — antes de este ticket, lib/data/servicios.ts no cacheaba
  // nada: este test confirmaba que revalidateTag() era un no-op real acá.
  // Ahora SÍ cachea (unstable_cache + TAG_POR_ENTIDAD.servicios_financieros),
  // así que el test pasa a probar lo contrario: un update directo a la tabla
  // (sin pasar por el panel) queda SERVIDO STALE hasta que algo invalide el
  // tag — y que revalidateTag() (lo que el panel real llama después de
  // escribir) es lo que lo hace fresco de nuevo.
  it("un update directo queda cacheado (stale) hasta que revalidateTag invalida el tag de la entidad", async () => {
    const servicio = await crearServicioTest({
      titulo: "Título viejo VGRP-52",
      nivel_requerido: "ninguno",
    });
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "avanzado" } });

    const { GET } = await import("./route");

    // Primer GET: puebla la caché con el título viejo.
    const resInicial = await GET();
    const bodyInicial = (await resInicial.json()) as { servicios: ServicioRespuesta[] };
    expect(bodyInicial.servicios.find((s) => s.id === servicio.id)?.publicMeta.titulo).toBe(
      "Título viejo VGRP-52",
    );

    // Simula lo que escribe el panel admin (PATCH
    // /api/admin/contenido/servicios_financieros/:id -> actualizarContenido()),
    // sin pasar por esa ruta HTTP completa (que es quien llama a
    // revalidateTag() después de escribir).
    const { error } = await admin
      .from("servicios_financieros")
      .update({ titulo: "Título nuevo del panel VGRP-52" })
      .eq("id", servicio.id);
    expect(error).toBeNull();

    // Sin invalidar todavía: el próximo GET sigue viendo el título viejo
    // desde caché — esto es lo que antes de VGRP-55 punto 1 NO pasaba.
    const resStale = await GET();
    const bodyStale = (await resStale.json()) as { servicios: ServicioRespuesta[] };
    expect(bodyStale.servicios.find((s) => s.id === servicio.id)?.publicMeta.titulo).toBe(
      "Título viejo VGRP-52",
    );

    const { revalidateTag } = await import("next/cache");
    revalidateTag(TAG_POR_ENTIDAD.servicios_financieros);

    const resFresco = await GET();
    const bodyFresco = (await resFresco.json()) as { servicios: ServicioRespuesta[] };
    expect(bodyFresco.servicios.find((s) => s.id === servicio.id)?.publicMeta.titulo).toBe(
      "Título nuevo del panel VGRP-52",
    );
  });
});
