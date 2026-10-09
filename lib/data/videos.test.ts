// VGRP-29 — tests de integración de lib/data/videos.ts contra el proyecto real de
// Supabase (mismo criterio que lib/data/admin/contenido.test.ts: no hay base separada,
// ver docs/TESTING.md). Cada test crea sus propias filas y las borra al terminar.
// La parte pura (armarGrilla, sin tope ni relleno) está en videos.unit.test.ts.

import { afterEach, describe, expect, it } from "vitest";
import { createTestAdminClient } from "../../test/helpers/db-client";
import { videoProvider } from "../video/provider";
import { obtenerVideosPorStage } from "./videos";

const admin = createTestAdminClient();

// La tabla compartida ya tiene videos reales (el contenido de la plataforma). Las filas de
// estos tests usan un `orden` muy negativo para quedar siempre primeras en la grilla: así
// ninguna aserción depende de cuántos videos reales haya cargados.
const PRIMERO = -1_000_000;

const idsCreados: string[] = [];

afterEach(async () => {
  while (idsCreados.length > 0) {
    const id = idsCreados.pop() as string;
    await admin.from("videos").delete().eq("id", id);
  }
});

async function crearVideoTest(valores: {
  stage: 1 | 2 | 3;
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
      orden: valores.orden ?? PRIMERO,
    })
    .select()
    .single();
  if (error) throw error;
  idsCreados.push(data.id);
  return data;
}

describe("obtenerVideosPorStage", () => {
  it("una fila publicada con provider_ref queda 'disponible' con las URLs de VideoProvider", async () => {
    const video = await crearVideoTest({
      stage: 2,
      titulo: "Test disponible",
      provider_ref: "dQw4w9WgXcQ",
      publicado: true,
    });

    const items = await obtenerVideosPorStage(admin, 2);
    const item = items.find((i) => i.id === video.id);

    expect(item).toBeDefined();
    expect(item?.embedUrl).toBe(videoProvider.urlEmbed("dQw4w9WgXcQ"));
    expect(item?.thumbnailUrl).toBe(videoProvider.urlThumbnail("dQw4w9WgXcQ"));
  });

  it("US-3 — publicado=false CON provider_ref real no aparece y su provider_ref nunca sale", async () => {
    const video = await crearVideoTest({
      stage: 2,
      titulo: "Test no publicado",
      provider_ref: "secreto-no-debe-salir",
      publicado: false,
    });

    const items = await obtenerVideosPorStage(admin, 2);

    // VGRP-88: ya no hay tile "Próximamente" para un no publicado — directamente no está.
    expect(items.find((i) => i.id === video.id)).toBeUndefined();
    expect(JSON.stringify(items)).not.toContain("secreto-no-debe-salir");
  });

  it("publicado=true pero sin provider_ref no aparece (no hay nada que reproducir)", async () => {
    const video = await crearVideoTest({
      stage: 2,
      titulo: "Test publicado sin ref",
      provider_ref: null,
      publicado: true,
    });

    const items = await obtenerVideosPorStage(admin, 2);

    expect(items.find((i) => i.id === video.id)).toBeUndefined();
  });

  it("no hay tiles de relleno: todo ítem es una fila real", async () => {
    const items = await obtenerVideosPorStage(admin, 2);

    expect(items.every((i) => typeof i.id === "string")).toBe(true);
  });

  it("sin tope: devuelve todos los publicados, no los primeros N", async () => {
    const creados = [];
    for (let i = 0; i < 16; i++) {
      creados.push(
        await crearVideoTest({
          stage: 2,
          titulo: `Sin tope ${i}`,
          provider_ref: "dQw4w9WgXcQ",
          publicado: true,
          orden: PRIMERO + i,
        }),
      );
    }

    const items = await obtenerVideosPorStage(admin, 2);
    const ids = new Set(items.map((i) => i.id));

    expect(creados.every((v) => ids.has(v.id))).toBe(true);
  });

  it("respeta el orden ('orden' ascendente)", async () => {
    const b = await crearVideoTest({
      stage: 2,
      titulo: "Segundo",
      provider_ref: "dQw4w9WgXcQ",
      publicado: true,
      orden: PRIMERO + 2,
    });
    const a = await crearVideoTest({
      stage: 2,
      titulo: "Primero",
      provider_ref: "dQw4w9WgXcQ",
      publicado: true,
      orden: PRIMERO + 1,
    });

    const items = await obtenerVideosPorStage(admin, 2);
    const propios = items.filter((i) => i.id === a.id || i.id === b.id).map((i) => i.id);

    expect(propios).toEqual([a.id, b.id]);
  });

  it("separa por stage: un video de stage 3 no aparece en stage 2", async () => {
    const video = await crearVideoTest({
      stage: 3,
      titulo: "Cómo usar el directorio de agentes",
      provider_ref: "dQw4w9WgXcQ",
      publicado: true,
    });

    expect((await obtenerVideosPorStage(admin, 3)).some((i) => i.id === video.id)).toBe(true);
    expect((await obtenerVideosPorStage(admin, 2)).some((i) => i.id === video.id)).toBe(false);
  });
});
