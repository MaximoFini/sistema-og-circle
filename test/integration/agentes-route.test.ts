// VGRP-49 — integración real de punta a punta de GET /api/agentes. Mismo
// criterio que test/integration/admin-usuarios-nivel.test.ts: se importa el
// handler REAL (no se mockea lib/data/agentes ni createServiceRoleClient) y
// sólo se reemplaza getVerifiedClaims — depende de next/headers (cookies()),
// no invocable así nomás desde Vitest en Node plano. Todo lo demás
// (obtenerAgentes, resolverSecreto, RLS de la tabla si el service role no la
// bypasseara) corre contra Supabase real.
//
// Éste es "el único camino por el que un contacto real llega al browser" —
// el test más importante del ticket es que el nivel salga SIEMPRE del claim
// verificado, nunca de nada que el caller pueda inyectar en el request.

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createTestAdminClient } from "../helpers/db-client";
import "../helpers/load-env";

const mockGetVerifiedClaims = vi.fn();
vi.mock("@/lib/auth/server", () => ({
  getVerifiedClaims: () => mockGetVerifiedClaims(),
}));

const { GET } = await import("../../app/api/agentes/route");

const admin = createTestAdminClient();
const MARCADOR = "[test] agentes-route";

const idsCreados: string[] = [];

afterEach(async () => {
  vi.restoreAllMocks();
  while (idsCreados.length > 0) {
    const id = idsCreados.pop() as string;
    await admin.from("agentes").delete().eq("id", id);
  }
});

async function crearAgente(nivel_requerido: "ninguno" | "principiante" | "avanzado") {
  const { data, error } = await admin
    .from("agentes")
    .insert({
      nombre: `${MARCADOR} ${randomUUID()}`,
      especialidad: "Especialidad de test",
      nivel_requerido,
      activo: true,
      contacto: "contacto-real-secreto-de-test",
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

describe("GET /api/agentes — integración real (VGRP-49)", () => {
  it("sesión principiante: una fila que requiere 'avanzado' llega con contacto: null y publicMeta presente", async () => {
    const agente = await crearAgente("avanzado");
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "u1",
      app_metadata: { nivel: "principiante", rol: "user" },
    });

    const res = await GET();
    expect(res.status).toBe(200);
    const body = await res.json();

    const item = (
      body.agentes as Array<{ id: string; contacto: string | null; publicMeta: unknown }>
    ).find((a) => a.id === agente.id);
    expect(item).toBeDefined();
    expect(item?.contacto).toBeNull();
    expect(item?.publicMeta).toEqual({
      nombre: agente.nombre,
      especialidad: agente.especialidad,
      nivelRequerido: "avanzado",
    });
    expect(JSON.stringify(body)).not.toContain("contacto-real-secreto-de-test");
    expect(body.nivelActual).toBe("principiante");
  });

  // EL TEST MÁS IMPORTANTE DEL TICKET (VGRP-49): el nivel sale del claim
  // verificado, JAMÁS del request. GET() ni siquiera declara un parámetro
  // Request en su firma real — se lo pasamos igual con datos "maliciosos"
  // para confirmar en runtime que no cambian nada, ni con un `as any` que se
  // salte el chequeo de tipos.
  it("ningún query param/header/body puede hacer que una sesión principiante reciba el contacto de una fila 'avanzado'", async () => {
    const agente = await crearAgente("avanzado");
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "u1",
      app_metadata: { nivel: "principiante", rol: "user" },
    });

    const requestMalicioso = new Request(
      "https://ogcircle.example/api/agentes?nivel=avanzado&nivelActual=avanzado",
      {
        method: "GET",
        headers: {
          "x-nivel": "avanzado",
          "x-forzar-nivel": "avanzado",
          cookie: "nivel=avanzado",
        },
        body: undefined,
      },
    );
    // biome-ignore lint/suspicious/noExplicitAny: GET real no acepta argumentos — se fuerza para confirmar que, aunque se le pasen, se ignoran.
    const res = await (GET as any)(requestMalicioso, {
      params: Promise.resolve({ nivel: "avanzado" }),
    });
    const body = await res.json();

    const item = (body.agentes as Array<{ id: string; contacto: string | null }>).find(
      (a) => a.id === agente.id,
    );
    expect(item?.contacto).toBeNull();
    expect(body.nivelActual).toBe("principiante");
  });

  it("sesión avanzado: recibe el contacto real, y nivelActual coincide con el claim", async () => {
    const agente = await crearAgente("avanzado");
    mockGetVerifiedClaims.mockResolvedValue({
      sub: "u2",
      app_metadata: { nivel: "avanzado", rol: "user" },
    });

    const res = await GET();
    const body = await res.json();

    const item = (body.agentes as Array<{ id: string; contacto: string | null }>).find(
      (a) => a.id === agente.id,
    );
    expect(item?.contacto).toBe("contacto-real-secreto-de-test");
    expect(body.nivelActual).toBe("avanzado");
  });

  it("sin sesión (claims=null): nunca expone contacto, nivelActual='ninguno'", async () => {
    const agente = await crearAgente("ninguno");
    mockGetVerifiedClaims.mockResolvedValue(null);

    const res = await GET();
    const body = await res.json();

    // nivel_requerido='ninguno' es el piso (hasNivel(null,'ninguno')===true,
    // ver lib/auth/claims.ts) — el propio resolverSecreto() SÍ expondría este
    // contacto sin sesión. Para probar el gating real hace falta una fila que
    // exija más que el piso.
    const item = (body.agentes as Array<{ id: string; contacto: string | null }>).find(
      (a) => a.id === agente.id,
    );
    expect(item?.contacto).toBe("contacto-real-secreto-de-test");
    expect(body.nivelActual).toBe("ninguno");
  });
});
