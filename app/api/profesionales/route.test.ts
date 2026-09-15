// VGRP-52 — tests de integración de GET /api/profesionales contra el proyecto real de
// Supabase (docs/TESTING.md). Sólo se mockea `getVerifiedClaims` (la frontera de
// sesión) — `createServiceRoleClient()` y `obtenerProfesionales()` corren 100% reales,
// mismo criterio que `test/integration/auth-actions.test.ts`.
//
// `lib/data/profesionales.test.ts` (VGRP-32) ya cubre la lógica de gating fila por fila
// de `obtenerProfesionales()` en sí — acá el foco es el CONTRATO HTTP de la ruta: qué
// claim usa, y que ese claim viene SIEMPRE de la sesión verificada, nunca de algo que
// el propio Request pudiera traer (la ruta ni siquiera declara un parámetro `Request`).

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import "../../../test/helpers/load-env";

const mockGetVerifiedClaims = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

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
  beforeEach(() => {
    vi.resetModules();
    mockGetVerifiedClaims.mockReset();
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

  it("revalidateTag es un NO-OP real para esta entidad: el próximo GET ya ve el cambio del panel sin depender de él", async () => {
    const prof = await crearProfesionalTest({ nombre: "Nombre viejo VGRP-52" });

    // Simula lo que escribe el panel admin (PATCH /api/admin/contenido/profesionales/:id
    // -> actualizarContenido()) sin pasar por esa ruta HTTP completa — esa ruta es quien
    // llama a revalidateTag() DESPUÉS de escribir, no lib/data/profesionales.ts.
    const { error } = await admin
      .from("profesionales")
      .update({ contacto: "contacto-actualizado-por-el-panel" })
      .eq("id", prof.id);
    expect(error).toBeNull();

    mockGetVerifiedClaims.mockResolvedValue({ app_metadata: { nivel: "avanzado" } });
    const { GET } = await import("./route");
    const res = await GET();
    const body = (await res.json()) as { profesionales: ProfesionalRespuesta[] };
    const item = body.profesionales.find((p) => p.id === prof.id);
    // Sin haber llamado a revalidateTag en ningún lado de este test: el Route Handler
    // es dinámico y lib/data/profesionales.ts no usa unstable_cache, así que no hay
    // nada que invalidar para ver el dato fresco.
    expect(item?.contacto).toBe("contacto-actualizado-por-el-panel");
  });
});
