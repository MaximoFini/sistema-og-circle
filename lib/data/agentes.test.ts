// VGRP-30/38 (seguimiento) — tests de integración de lib/data/agentes.ts contra el
// proyecto real de Supabase (mismo criterio que lib/data/videos.test.ts). Cada test crea
// sus propias filas y las borra al terminar.
//
// VGRP-59/60 (Bloque 13 — plan único): `nivel_requerido` dejó de existir en la tabla
// `agentes` — el gating ahora es binario (con acceso / sin acceso), vía `tieneAcceso()`.

import { afterEach, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../test/helpers/db-client";
import type { AppMetadataClaims } from "../auth/claims";
import { obtenerAgentes } from "./agentes";

const admin = createTestAdminClient();

const idsCreados: string[] = [];

afterEach(async () => {
  while (idsCreados.length > 0) {
    const id = idsCreados.pop() as string;
    await admin.from("agentes").delete().eq("id", id);
  }
});

function claimsConNivel(nivel: string): AppMetadataClaims {
  return { app_metadata: { nivel } };
}

async function crearAgenteTest(valores: {
  nombre: string;
  contacto?: string | null;
  activo?: boolean;
  orden?: number;
}) {
  const { data, error } = await admin
    .from("agentes")
    .insert({
      nombre: valores.nombre,
      especialidad: "Test",
      contacto: valores.contacto ?? "contacto-secreto-de-test",
      activo: valores.activo ?? true,
      orden: valores.orden ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

describe("obtenerAgentes", () => {
  it("expone el contacto cuando el claim tiene el plan completo", async () => {
    const agente = await crearAgenteTest({ nombre: "Test con acceso" });

    const items = await obtenerAgentes(admin, claimsConNivel("completo"));
    const item = items.find((i) => i.id === agente.id);

    expect(item?.contacto).toBe("contacto-secreto-de-test");
    expect(item?.publicMeta.nombre).toBe("Test con acceso");
  });

  it("US-3-style — oculta el contacto cuando el claim NO tiene el plan, pero muestra publicMeta", async () => {
    const agente = await crearAgenteTest({ nombre: "Test bloqueado" });

    const items = await obtenerAgentes(admin, claimsConNivel("ninguno"));
    const item = items.find((i) => i.id === agente.id);

    expect(item).toBeDefined();
    expect(item?.contacto).toBeNull();
    expect(item?.publicMeta.nombre).toBe("Test bloqueado");
    expect(JSON.stringify(item)).not.toContain("contacto-secreto-de-test");
  });

  it("sin sesión (claims null) nunca expone el contacto", async () => {
    const agente = await crearAgenteTest({ nombre: "Test sin sesión" });

    const items = await obtenerAgentes(admin, null);
    const item = items.find((i) => i.id === agente.id);

    expect(item?.contacto).toBeNull();
  });

  it("excluye filas activo=false", async () => {
    const agente = await crearAgenteTest({ nombre: "Test inactivo", activo: false });

    const items = await obtenerAgentes(admin, claimsConNivel("completo"));

    expect(items.some((i) => i.id === agente.id)).toBe(false);
  });

  it("respeta el orden ('orden' ascendente)", async () => {
    const b = await crearAgenteTest({ nombre: "Segundo", orden: 2 });
    const a = await crearAgenteTest({ nombre: "Primero", orden: 1 });

    const items = await obtenerAgentes(admin, claimsConNivel("completo"));
    const ids = items.filter((i) => i.id === a.id || i.id === b.id).map((i) => i.id);

    expect(ids).toEqual([a.id, b.id]);
  });
});
