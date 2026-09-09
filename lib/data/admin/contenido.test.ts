// VGRP-38 — tests de integración de lib/data/admin/contenido.ts contra el
// proyecto real de Supabase (no hay base separada, ver docs/TESTING.md).
// Cada test crea sus propias filas y las borra al terminar (afterEach).

import { afterEach, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import {
  actualizarContenido,
  borrarContenido,
  crearContenido,
  ENTIDADES,
  esEntidadValida,
  ItemNoEncontrado,
  listarContenido,
} from "./contenido";

const admin = createTestAdminClient();

const idsCreados: { entidad: (typeof ENTIDADES)[number]; id: string }[] = [];

afterEach(async () => {
  while (idsCreados.length > 0) {
    const { entidad, id } = idsCreados.pop() as (typeof idsCreados)[number];
    // Borrado directo (no borrarContenido(), que en `videos` hace
    // soft-delete): la limpieza de test siempre quiere sacar la fila entera.
    await admin.from(entidad).delete().eq("id", id);
  }
});

describe("esEntidadValida", () => {
  it("acepta las 4 entidades reales", () => {
    for (const e of ENTIDADES) expect(esEntidadValida(e)).toBe(true);
  });

  it("rechaza cualquier otra cosa, incluida una tabla real no destinada a este CRUD", () => {
    expect(esEntidadValida("profiles")).toBe(false);
    expect(esEntidadValida("agentes; drop table profiles;")).toBe(false);
    expect(esEntidadValida("")).toBe(false);
  });
});

describe("crearContenido / actualizarContenido / listarContenido (agentes)", () => {
  it("crea, lista y actualiza un agente de verdad", async () => {
    const creado = await crearContenido(admin, "agentes", {
      nombre: `Test Agente ${Date.now()}`,
      especialidad: "Test",
      nivel_requerido: "avanzado",
      contacto: "contacto-de-test",
      orden: 999,
      activo: true,
    });
    idsCreados.push({ entidad: "agentes", id: creado.entidadId as string });

    expect(creado.valorAnterior).toBeNull();
    expect(creado.resultado.nombre).toContain("Test Agente");
    expect(creado.entidadId).toBe(creado.resultado.id);

    const listado = await listarContenido(admin, "agentes");
    expect(listado.some((a) => a.id === creado.resultado.id)).toBe(true);

    const actualizado = await actualizarContenido(admin, "agentes", creado.resultado.id, {
      nombre: "Nombre editado",
    });
    expect(actualizado.resultado.nombre).toBe("Nombre editado");
    // El resto de los campos no tocados en el PATCH se mantiene.
    expect(actualizado.resultado.especialidad).toBe("Test");
    expect(actualizado.valorAnterior).not.toBeNull();
  });

  it("actualizar un id inexistente tira ItemNoEncontrado, sin escribir nada", async () => {
    await expect(
      actualizarContenido(admin, "agentes", "00000000-0000-0000-0000-000000000000", {
        nombre: "no debería aplicar",
      }),
    ).rejects.toThrow(ItemNoEncontrado);
  });

  it("rechaza un valor fuera de forma (Zod) antes de tocar la base", async () => {
    await expect(
      crearContenido(admin, "agentes", { nombre: "", especialidad: "x" }),
    ).rejects.toThrow();
  });
});

describe("borrarContenido", () => {
  it("videos: SIEMPRE soft-delete (publicado=false), nunca borra la fila", async () => {
    const creado = await crearContenido(admin, "videos", {
      stage: 1,
      titulo: "Video de test",
      nivel_requerido: "principiante",
      orden: 999,
      publicado: true,
    });
    idsCreados.push({ entidad: "videos", id: creado.entidadId as string });

    const borrado = await borrarContenido(admin, "videos", creado.entidadId as string);
    expect(borrado.resultado?.publicado).toBe(false);

    // La fila sigue existiendo (soft-delete) — profiles.progreso podría
    // referenciarla por id (PRD §4.1, US-5 de requirements-vgrp38.md).
    const { data } = await admin
      .from("videos")
      .select("id")
      .eq("id", creado.entidadId as string)
      .maybeSingle();
    expect(data).not.toBeNull();
  });

  it("agentes: DELETE real (sin referencias conocidas desde otro lado)", async () => {
    const creado = await crearContenido(admin, "agentes", {
      nombre: "Agente a borrar",
      especialidad: "Test",
      nivel_requerido: "principiante",
      orden: 999,
      activo: true,
    });
    // No se agrega a idsCreados: si borrarContenido() funciona, no queda nada que limpiar.

    await borrarContenido(admin, "agentes", creado.entidadId as string);

    const { data } = await admin
      .from("agentes")
      .select("id")
      .eq("id", creado.entidadId as string)
      .maybeSingle();
    expect(data).toBeNull();
  });

  it("borrar un id inexistente tira ItemNoEncontrado", async () => {
    await expect(
      borrarContenido(admin, "profesionales", "00000000-0000-0000-0000-000000000000"),
    ).rejects.toThrow(ItemNoEncontrado);
  });
});
