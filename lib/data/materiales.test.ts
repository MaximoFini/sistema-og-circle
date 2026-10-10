// VGRP-88 — lib/data/materiales.ts contra el proyecto real de Supabase (no hay base
// separada, ver docs/TESTING.md). Cada test crea sus filas y las borra al terminar; los
// títulos llevan "[test]" (red de contención de test/helpers/cleanup.ts). Estas filas no
// tienen archivo en Storage: la lectura no lo necesita.

import { randomUUID } from "node:crypto";
import { afterEach, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../test/helpers/db-client";
import { listarMaterialesPublicados } from "./materiales";

const admin = createTestAdminClient();
const idsCreados: string[] = [];
// Primeras en la lista, sin importar cuántos materiales reales haya.
const PRIMERO = -1_000_000;

afterEach(async () => {
  if (idsCreados.length === 0) return;
  await admin.from("materiales").delete().in("id", idsCreados.splice(0));
});

async function crearMaterialTest(valores: {
  titulo: string;
  publicado?: boolean;
  orden?: number;
  extension?: string;
  tipo?: string;
}) {
  const { data, error } = await admin
    .from("materiales")
    .insert({
      titulo: `[test] ${valores.titulo}`,
      storage_path: `archivos/${randomUUID()}.${valores.extension ?? "pdf"}`,
      extension: valores.extension ?? "pdf",
      tipo: valores.tipo ?? "pdf",
      tamano_bytes: 1234,
      publicado: valores.publicado ?? true,
      orden: valores.orden ?? PRIMERO,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

describe("listarMaterialesPublicados", () => {
  it("devuelve los publicados sin storage_path", async () => {
    const m = await crearMaterialTest({ titulo: "publicado" });

    const items = await listarMaterialesPublicados(admin);
    const item = items.find((i) => i.id === m.id);

    expect(item).toEqual({
      id: m.id,
      titulo: "[test] publicado",
      descripcion: null,
      tipo: "pdf",
      extension: "pdf",
      tamanoBytes: 1234,
    });
    expect(JSON.stringify(items)).not.toContain(m.storage_path);
  });

  it("no devuelve los ocultos", async () => {
    const m = await crearMaterialTest({ titulo: "oculto", publicado: false });

    const items = await listarMaterialesPublicados(admin);

    expect(items.some((i) => i.id === m.id)).toBe(false);
  });

  it("respeta el orden del admin", async () => {
    const segundo = await crearMaterialTest({ titulo: "segundo", orden: PRIMERO + 2 });
    const primero = await crearMaterialTest({ titulo: "primero", orden: PRIMERO + 1 });

    const items = await listarMaterialesPublicados(admin);
    const propios = items.filter((i) => i.id === primero.id || i.id === segundo.id);

    expect(propios.map((i) => i.id)).toEqual([primero.id, segundo.id]);
  });

  it("el tipo sale de la extensión", async () => {
    const m = await crearMaterialTest({ titulo: "planilla", extension: "csv", tipo: "excel" });

    const item = (await listarMaterialesPublicados(admin)).find((i) => i.id === m.id);

    expect(item?.tipo).toBe("excel");
    expect(item?.extension).toBe("csv");
  });
});

describe("constraints de la tabla (migración 20261009120000)", () => {
  it("rechaza un tipo o una extensión fuera de la lista", async () => {
    const base = {
      titulo: "[test] inválido",
      tamano_bytes: 10,
      storage_path: `archivos/${randomUUID()}.exe`,
    };
    const conExtension = await admin
      .from("materiales")
      .insert({ ...base, extension: "exe", tipo: "pdf" });
    expect(conExtension.error).not.toBeNull();
    const conTipo = await admin.from("materiales").insert({
      ...base,
      storage_path: `archivos/${randomUUID()}.pdf`,
      extension: "pdf",
      tipo: "zip",
    });
    expect(conTipo.error).not.toBeNull();
  });

  it("rechaza más de 50 MB y tamaños no positivos", async () => {
    for (const tamano_bytes of [52_428_801, 0, -1]) {
      const { error } = await admin.from("materiales").insert({
        titulo: "[test] tamaño",
        storage_path: `archivos/${randomUUID()}.pdf`,
        extension: "pdf",
        tipo: "pdf",
        tamano_bytes,
      });
      expect(error, `tamano_bytes=${tamano_bytes}`).not.toBeNull();
    }
  });

  it("rechaza un título vacío", async () => {
    const { error } = await admin.from("materiales").insert({
      titulo: "   ",
      storage_path: `archivos/${randomUUID()}.pdf`,
      extension: "pdf",
      tipo: "pdf",
      tamano_bytes: 10,
    });
    expect(error).not.toBeNull();
  });

  it("un usuario autenticado sin service role no puede leer la tabla (sin policies)", async () => {
    const m = await crearMaterialTest({ titulo: "secreto" });
    const { createTestAnonClient } = await import("../../test/helpers/db-client");

    const { data } = await createTestAnonClient()
      .from("materiales")
      .select("storage_path")
      .eq("id", m.id);

    expect(data ?? []).toEqual([]);
  });
});
