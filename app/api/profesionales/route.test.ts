// VGRP-52 — tests de integración de GET /api/profesionales contra el proyecto real de
// Supabase (docs/TESTING.md). Se mockea `getVerifiedClaims` (la frontera de sesión) y,
// desde VGRP-55 punto 1, `next/cache` (ver más abajo) — `createServiceRoleClient()` y
// la lectura real de filas corren 100% reales.
//
// `lib/data/profesionales.test.ts` (VGRP-32) ya cubre la lógica de gating fila por fila
// de `obtenerProfesionales()` en sí — acá el foco es el CONTRATO HTTP de la ruta: qué
// claim usa, y que ese claim viene SIEMPRE de la sesión verificada, nunca de algo que
// el propio Request pudiera traer (la ruta ni siquiera declara un parámetro `Request`).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TAG_POR_ENTIDAD } from "../../../lib/data/admin/contenido";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import "../../../test/helpers/load-env";

const mockGetVerifiedClaims = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

// VGRP-55 punto 1 — lib/data/profesionales.ts ahora usa unstable_cache de
// verdad; mismo mock que app/api/servicios-financieros/route.test.ts (cachea
// por key+args, invalida por tag) para que el test de "revalidateTag" de más
// abajo pruebe el mecanismo real, no sólo el fallback de incrementalCache.
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

async function crearProfesionalTest(valores: {
  nombre: string;
  contacto?: string | null;
  activo?: boolean;
}) {
  const { data, error } = await admin
    .from("profesionales")
    .insert({
      nombre: valores.nombre,
      rubro: "Test",
      descripcion: null,
      contacto: valores.contacto ?? "contacto-de-test",
      activo: valores.activo ?? true,
      orden: 0,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

interface ProfesionalRespuesta {
  id: string;
  publicMeta: { nombre: string; rubro: string; descripcion: string | null };
  contacto: string | null;
}

describe("GET /api/profesionales", () => {
  beforeEach(async () => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
    // Ver el comentario del mock de next/cache: su `store` sobrevive entre
    // tests (Vitest no re-ejecuta el factory de vi.mock en cada
    // resetModules()) — se invalida a mano para que cada test arranque con
    // caché fría.
    const { revalidateTag } = await import("next/cache");
    revalidateTag(TAG_POR_ENTIDAD.profesionales);
  });

  afterEach(async () => {
    while (idsCreados.length > 0) {
      const id = idsCreados.pop() as string;
      await admin.from("profesionales").delete().eq("id", id);
    }
  });

  it("sin sesión (claims null): 200 con contacto:null en todas las filas — el 401 real lo da el middleware, no esta ruta", async () => {
    const prof = await crearProfesionalTest({ nombre: "Sin sesión VGRP-52" });
    mockGetVerifiedClaims.mockResolvedValue(null);

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as { profesionales: ProfesionalRespuesta[] };
    const item = body.profesionales.find((p) => p.id === prof.id);
    expect(item).toBeDefined();
    expect(item?.contacto).toBeNull();
    // Ninguna fila trae contacto sin sesión — no es sólo la que sembramos.
    expect(body.profesionales.every((p) => p.contacto === null)).toBe(true);
  });

  it("sesión real nivel 'ninguno': SÍ trae contacto (profesionales no gatea por nivel, VGRP-38)", async () => {
    const prof = await crearProfesionalTest({ nombre: "Con sesión ninguno VGRP-52" });
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "ninguno" } });

    const { GET } = await import("./route");
    const res = await GET();
    expect(res.status).toBe(200);

    const body = (await res.json()) as { profesionales: ProfesionalRespuesta[] };
    const item = body.profesionales.find((p) => p.id === prof.id);
    expect(item?.contacto).toBe("contacto-de-test");
  });

  it("el contacto sale del claim verificado, nunca de algo que el propio Request pudiera traer", async () => {
    const prof = await crearProfesionalTest({ nombre: "No debe leer el Request VGRP-52" });
    mockGetVerifiedClaims.mockResolvedValue(null);

    const reqEnvenenado = new Request(
      "https://ogcircle.example/api/profesionales?sesion=si&claims=avanzado",
      { headers: { "x-forzar-sesion": "true" } },
    );

    const { GET } = await import("./route");
    // GET() no declara ningún parámetro — ni siquiera podría leer esto. Se lo pasamos
    // igual: si algún día alguien "mejora" la firma para leer la URL/headers, este test
    // se pone en rojo.
    const res = await (GET as (req: Request) => Promise<Response>)(reqEnvenenado);
    const body = (await res.json()) as { profesionales: ProfesionalRespuesta[] };
    const item = body.profesionales.find((p) => p.id === prof.id);
    expect(item?.contacto).toBeNull();
  });

  // VGRP-55 punto 1 — antes de este ticket, lib/data/profesionales.ts no
  // cacheaba nada: este test confirmaba que revalidateTag() era un no-op
  // real acá. Ahora SÍ cachea (unstable_cache + TAG_POR_ENTIDAD.profesionales),
  // así que pasa a probar lo contrario: un update directo queda stale hasta
  // que algo invalide el tag.
  it("un update directo queda cacheado (stale) hasta que revalidateTag invalida el tag de la entidad", async () => {
    const prof = await crearProfesionalTest({ nombre: "Nombre viejo VGRP-52" });
    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "avanzado" } });

    const { GET } = await import("./route");

    const resInicial = await GET();
    const bodyInicial = (await resInicial.json()) as { profesionales: ProfesionalRespuesta[] };
    expect(bodyInicial.profesionales.find((p) => p.id === prof.id)?.contacto).toBe(
      "contacto-de-test",
    );

    // Simula lo que escribe el panel admin (PATCH /api/admin/contenido/profesionales/:id
    // -> actualizarContenido()) sin pasar por esa ruta HTTP completa — esa ruta es quien
    // llama a revalidateTag() DESPUÉS de escribir, no lib/data/profesionales.ts.
    const { error } = await admin
      .from("profesionales")
      .update({ contacto: "contacto-actualizado-por-el-panel" })
      .eq("id", prof.id);
    expect(error).toBeNull();

    const resStale = await GET();
    const bodyStale = (await resStale.json()) as { profesionales: ProfesionalRespuesta[] };
    expect(bodyStale.profesionales.find((p) => p.id === prof.id)?.contacto).toBe(
      "contacto-de-test",
    );

    const { revalidateTag } = await import("next/cache");
    revalidateTag(TAG_POR_ENTIDAD.profesionales);

    const resFresco = await GET();
    const bodyFresco = (await resFresco.json()) as { profesionales: ProfesionalRespuesta[] };
    expect(bodyFresco.profesionales.find((p) => p.id === prof.id)?.contacto).toBe(
      "contacto-actualizado-por-el-panel",
    );
  });
});
