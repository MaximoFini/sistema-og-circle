// VGRP-29 — tests de integración de lib/data/videos.ts contra el proyecto real de
// Supabase (mismo criterio que lib/data/admin/contenido.test.ts: no hay base separada,
// ver docs/TESTING.md). Cada test crea sus propias filas y las borra al terminar.

import { afterEach, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../test/helpers/db-client";
import { videoProvider } from "../video/provider";
import { CANTIDAD_STAGE, obtenerVideosPorStage, TOTAL_VIDEOS } from "./videos";

const admin = createTestAdminClient();

const idsCreados: string[] = [];

afterEach(async () => {
  while (idsCreados.length > 0) {
    const id = idsCreados.pop() as string;
    await admin.from("videos").delete().eq("id", id);
  }
});

async function crearVideoTest(valores: {
  stage: 1 | 2;
  titulo: string;
  provider_ref?: string | null;
  publicado?: boolean;
  orden?: number;
}) {
  const { data, error } = await admin
    .from("videos")
    .insert({
      stage: valores.stage,
      titulo: valores.titulo,
      descripcion: null,
      provider_ref: valores.provider_ref ?? null,
      publicado: valores.publicado ?? false,
      orden: valores.orden ?? 0,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

describe("TOTAL_VIDEOS / CANTIDAD_STAGE", () => {
  it("es 8 + 3 = 11 (MODULOS.md §2, formato 'X / 11')", () => {
    expect(CANTIDAD_STAGE[1]).toBe(8);
    expect(CANTIDAD_STAGE[2]).toBe(3);
    expect(TOTAL_VIDEOS).toBe(11);
  });
});

describe("obtenerVideosPorStage", () => {
  it("una fila publicada con provider_ref queda 'disponible' con las URLs de VideoProvider", async () => {
    const video = await crearVideoTest({
      stage: 2,
      titulo: "Test disponible",
      provider_ref: "dQw4w9WgXcQ",
      publicado: true,
      orden: 1,
    });

    const items = await obtenerVideosPorStage(admin, 2);
    const item = items.find((i) => i.id === video.id);

    expect(item).toBeDefined();
    expect(item?.estado).toBe("disponible");
    expect(item?.embedUrl).toBe(videoProvider.urlEmbed("dQw4w9WgXcQ"));
    expect(item?.thumbnailUrl).toBe(videoProvider.urlThumbnail("dQw4w9WgXcQ"));
  });

  it("US-3 — publicado=false CON provider_ref real nunca expone el provider_ref: 'proximamente', URLs null", async () => {
    const video = await crearVideoTest({
      stage: 2,
      titulo: "Test no publicado",
      provider_ref: "secreto-no-debe-salir",
      publicado: false,
      orden: 2,
    });

    const items = await obtenerVideosPorStage(admin, 2);
    const item = items.find((i) => i.id === video.id);

    expect(item).toBeDefined();
    expect(item?.estado).toBe("proximamente");
    expect(item?.embedUrl).toBeNull();
    expect(item?.thumbnailUrl).toBeNull();
    // Ninguna URL generada contiene el provider_ref sensible — chequeo directo, no
    // sólo "es null".
    expect(JSON.stringify(item)).not.toContain("secreto-no-debe-salir");
  });

  it("publicado=true pero sin provider_ref queda 'proximamente' (no hay nada que reproducir)", async () => {
    const video = await crearVideoTest({
      stage: 2,
      titulo: "Test publicado sin ref",
      provider_ref: null,
      publicado: true,
      orden: 3,
    });

    const items = await obtenerVideosPorStage(admin, 2);
    const item = items.find((i) => i.id === video.id);

    expect(item?.estado).toBe("proximamente");
    expect(item?.embedUrl).toBeNull();
    expect(item?.thumbnailUrl).toBeNull();
  });

  it("completa con tiles sintéticos hasta el tamaño fijo del stage", async () => {
    // Stage 2 = 3 tiles siempre, sin crear ninguna fila real.
    const items = await obtenerVideosPorStage(admin, 2);

    expect(items).toHaveLength(CANTIDAD_STAGE[2]);
    for (const item of items) {
      expect(item.id).toBeNull();
      expect(item.estado).toBe("proximamente");
    }
  });

  it("no agrega sintéticos si ya hay exactamente el tamaño fijo de filas reales", async () => {
    await crearVideoTest({ stage: 2, titulo: "V1", orden: 1 });
    await crearVideoTest({ stage: 2, titulo: "V2", orden: 2 });
    await crearVideoTest({ stage: 2, titulo: "V3", orden: 3 });

    const items = await obtenerVideosPorStage(admin, 2);

    expect(items).toHaveLength(CANTIDAD_STAGE[2]);
    expect(items.every((i) => i.id !== null)).toBe(true);
  });

  it("respeta el orden ('orden' ascendente)", async () => {
    const b = await crearVideoTest({ stage: 2, titulo: "Segundo", orden: 2 });
    const a = await crearVideoTest({ stage: 2, titulo: "Primero", orden: 1 });

    const items = await obtenerVideosPorStage(admin, 2);
    const idsReales = items.filter((i) => i.id !== null).map((i) => i.id);

    expect(idsReales).toEqual([a.id, b.id]);
  });
});
