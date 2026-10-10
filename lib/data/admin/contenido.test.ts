// VGRP-38 — tests de integración de lib/data/admin/contenido.ts contra el
// proyecto real de Supabase (no hay base separada, ver docs/TESTING.md).
// Cada test crea sus propias filas y las borra al terminar (afterEach).

import { afterEach, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../../test/helpers/db-client";
import {
  actualizarContenido,
  armarVideosEditor,
  borrarContenido,
  crearContenido,
  ENTIDADES,
  esEntidadValida,
  ItemNoEncontrado,
  listarContenido,
  listarVideosParaEditor,
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

describe("videos: provider_ref", () => {
  // El link -> id y el "PATCH sin el campo no lo pisa" se cubren en el test de
  // soft-delete de abajo (misma ida a la base); los formatos, en
  // lib/video/provider.test.ts.
  it("rechaza un valor que no es un video reconocible, antes de tocar la base", async () => {
    await expect(
      crearContenido(admin, "videos", {
        stage: 1,
        titulo: "Video de test",
        orden: 999,
        publicado: true,
        provider_ref: "gy8t0Yy0cOIeXEeQ",
      }),
    ).rejects.toThrow(/link de .* válido/);
  });

  it("vacío se guarda como null (queda 'Próximamente')", async () => {
    const creado = await crearContenido(admin, "videos", {
      stage: 1,
      titulo: "Video de test",
      orden: 999,
      publicado: false,
      provider_ref: "  ",
    });
    idsCreados.push({ entidad: "videos", id: creado.entidadId as string });
    expect(creado.resultado.provider_ref).toBeNull();
  });
});

describe("borrarContenido", () => {
  it("videos: SIEMPRE soft-delete (publicado=false), nunca borra la fila", async () => {
    // Se crea sin publicar a propósito: publicar uno nuevo depende del cupo del stage, y
    // la tabla compartida puede tener videos reales. El soft-delete se comporta igual.
    const creado = await crearContenido(admin, "videos", {
      stage: 1,
      titulo: "Video de test",
      orden: 999,
      publicado: false,
      // Link de Compartir con `?si=`: se guarda sólo el id.
      provider_ref: "https://youtu.be/dQw4w9WgXcQ?si=gy8t0Yy0cOIeXEeQ",
    });
    idsCreados.push({ entidad: "videos", id: creado.entidadId as string });
    expect(creado.resultado.provider_ref).toBe("dQw4w9WgXcQ");

    const borrado = await borrarContenido(admin, "videos", creado.entidadId as string);
    expect(borrado.resultado?.publicado).toBe(false);
    // El soft-delete es un PATCH sin provider_ref: no lo pisa.
    expect(borrado.resultado?.provider_ref).toBe("dQw4w9WgXcQ");

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

describe("videos: sin tope por stage y volver a publicar al final", () => {
  const STAGE = 2;

  async function crearTest(publicado: boolean, titulo: string) {
    const creado = await crearContenido(admin, "videos", { stage: STAGE, titulo, publicado });
    idsCreados.push({ entidad: "videos", id: creado.entidadId as string });
    return creado;
  }

  it("crear un video publicado nunca se rechaza por la cantidad que ya hay en el stage", async () => {
    const creado = await crearTest(true, "Publicado sin tope");
    expect(creado.resultado.publicado).toBe(true);
  });

  it("publicar un despublicado nunca se rechaza por la cantidad que ya hay en el stage", async () => {
    const borrador = await crearTest(false, "Borrador a publicar");

    const publicado = await actualizarContenido(admin, "videos", borrador.entidadId as string, {
      publicado: true,
    });

    expect(publicado.resultado.publicado).toBe(true);
  });

  it("al volver a publicar, el video queda AL FINAL (orden mayor que todos los del stage)", async () => {
    const borrador = await crearTest(false, "Vuelve al final");
    // Su orden original es el próximo disponible; se mueve más atrás para comprobar
    // que republicar lo REASIGNA al final y no conserva el lugar anterior.
    await admin
      .from("videos")
      .update({ orden: -500 })
      .eq("id", borrador.entidadId as string);

    const publicado = await actualizarContenido(admin, "videos", borrador.entidadId as string, {
      publicado: true,
    });

    const { data } = await admin.from("videos").select("orden").eq("stage", STAGE);
    const maximo = Math.max(...(data ?? []).map((v) => v.orden));
    expect(publicado.resultado.orden).toBe(maximo);
    expect(publicado.resultado.orden).toBeGreaterThan(-500);
  });
});

describe("armarVideosEditor (parte pura)", () => {
  function fila(
    n: number,
    extra: { stage?: 1 | 2 | 3; publicado?: boolean; provider_ref?: string | null } = {},
  ) {
    return {
      id: `id-${n}`,
      stage: extra.stage ?? 1,
      titulo: `Video ${n}`,
      descripcion: null,
      provider_ref: extra.provider_ref ?? null,
      publicado: extra.publicado ?? true,
      orden: n,
    };
  }

  it("reparte por stage y separa publicados de despublicados, conservando el orden", () => {
    const r = armarVideosEditor([
      fila(1, { stage: 1 }),
      fila(2, { stage: 2, publicado: false }),
      fila(3, { stage: 1, publicado: false }),
      fila(4, { stage: 2 }),
    ]);

    expect(r[1].publicados.map((v) => v.id)).toEqual(["id-1"]);
    expect(r[1].despublicados.map((v) => v.id)).toEqual(["id-3"]);
    expect(r[2].publicados.map((v) => v.id)).toEqual(["id-4"]);
    expect(r[2].despublicados.map((v) => v.id)).toEqual(["id-2"]);
  });

  it("sin tope: muestra todos los publicados del stage y deja pasar los despublicados", () => {
    const filas = Array.from({ length: 16 }, (_, i) => fila(i, { stage: 2 }));
    const r = armarVideosEditor([...filas, fila(99, { stage: 2, publicado: false })]);

    expect(r[2].publicados.map((v) => v.id)).toEqual(filas.map((v) => v.id));
    expect(r[2].despublicados.map((v) => v.id)).toEqual(["id-99"]);
  });

  it("ignora el Stage 3 (fuera de este editor)", () => {
    const r = armarVideosEditor([fila(1, { stage: 3 })]);

    expect(r[1].publicados).toHaveLength(0);
    expect(r[2].publicados).toHaveLength(0);
    expect(Object.keys(r)).toEqual(["1", "2"]);
  });

  it("la miniatura sólo existe si está publicado y el link es válido", () => {
    const r = armarVideosEditor([
      fila(1, { provider_ref: "dQw4w9WgXcQ" }),
      fila(2, { provider_ref: null }),
      fila(3, { provider_ref: "dQw4w9WgXcQ", publicado: false }),
    ]);

    expect(r[1].publicados[0]?.thumbnailUrl).toContain("dQw4w9WgXcQ");
    expect(r[1].publicados[1]?.thumbnailUrl).toBeNull();
    expect(r[1].despublicados[0]?.thumbnailUrl).toBeNull();
    // Al admin sí se le entrega el id para poder editarlo.
    expect(r[1].despublicados[0]?.providerRef).toBe("dQw4w9WgXcQ");
  });
});

describe("listarVideosParaEditor", () => {
  it("un video despublicado aparece en `despublicados`, no en `publicados`", async () => {
    const creado = await crearContenido(admin, "videos", {
      stage: 2,
      titulo: `Borrador editor ${crypto.randomUUID()}`,
      publicado: false,
    });
    idsCreados.push({ entidad: "videos", id: creado.entidadId as string });

    const r = await listarVideosParaEditor(admin);

    expect(r[2].despublicados.some((v) => v.id === creado.entidadId)).toBe(true);
    expect(r[2].publicados.some((v) => v.id === creado.entidadId)).toBe(false);
  });
});
