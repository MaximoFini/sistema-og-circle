// VGRP-30/38 (seguimiento) — tests de integración de lib/data/agentes.ts contra el
// proyecto real de Supabase (mismo criterio que lib/data/videos.test.ts). Cada test crea
// sus propias filas y las borra al terminar.

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
  nivel_requerido: "ninguno" | "principiante" | "avanzado";
  contacto?: string | null;
  activo?: boolean;
  orden?: number;
}) {
  const { data, error } = await admin
    .from("agentes")
    .insert({
      nombre: valores.nombre,
      especialidad: "Test",
      nivel_requerido: valores.nivel_requerido,
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
  it("expone el contacto cuando el nivel del claim alcanza el nivel_requerido", async () => {
    const agente = await crearAgenteTest({
      nombre: "Test alcanza",
      nivel_requerido: "principiante",
    });

    const items = await obtenerAgentes(admin, claimsConNivel("avanzado"));
    const item = items.find((i) => i.id === agente.id);

    expect(item?.contacto).toBe("contacto-secreto-de-test");
    expect(item?.publicMeta.nombre).toBe("Test alcanza");
  });

  it("US-3-style — oculta el contacto cuando el nivel del claim NO alcanza, pero muestra publicMeta", async () => {
    const agente = await crearAgenteTest({ nombre: "Test bloqueado", nivel_requerido: "avanzado" });

    const items = await obtenerAgentes(admin, claimsConNivel("principiante"));
    const item = items.find((i) => i.id === agente.id);

    expect(item).toBeDefined();
    expect(item?.contacto).toBeNull();
    expect(item?.publicMeta.nombre).toBe("Test bloqueado");
    expect(JSON.stringify(item)).not.toContain("contacto-secreto-de-test");
  });

  it("sin sesión (claims null) nunca expone el contacto de una fila gateada", async () => {
    // nivel_requerido="ninguno" es la excepción a propósito (hasNivel(null, "ninguno")
    // da true: es el piso, lo cumple cualquiera, incluso sin sesión) — para probar el
    // caso real de gating hace falta una fila que sí requiera nivel.
    const agente = await crearAgenteTest({
      nombre: "Test sin sesión",
      nivel_requerido: "principiante",
    });

    const items = await obtenerAgentes(admin, null);
    const item = items.find((i) => i.id === agente.id);

    expect(item?.contacto).toBeNull();
  });

  it("excluye filas activo=false", async () => {
    const agente = await crearAgenteTest({
      nombre: "Test inactivo",
      nivel_requerido: "ninguno",
      activo: false,
    });

    const items = await obtenerAgentes(admin, claimsConNivel("avanzado"));

    expect(items.some((i) => i.id === agente.id)).toBe(false);
  });

  it("respeta el orden ('orden' ascendente)", async () => {
    const b = await crearAgenteTest({ nombre: "Segundo", nivel_requerido: "ninguno", orden: 2 });
    const a = await crearAgenteTest({ nombre: "Primero", nivel_requerido: "ninguno", orden: 1 });

    const items = await obtenerAgentes(admin, claimsConNivel("avanzado"));
    const ids = items.filter((i) => i.id === a.id || i.id === b.id).map((i) => i.id);

    expect(ids).toEqual([a.id, b.id]);
  });
});
