// VGRP-50 — obtenerVideosStageConFallback() (lib/data/videos.ts, del commit 57ebd28):
// hueco total, sin ningún test. Archivo SEPARADO de videos.test.ts (que sí pega contra
// Supabase real, ver docs/TESTING.md) porque acá se mockea todo a propósito — ni el
// cliente de Supabase ni next/cache tocan nada real. Lo que se prueba es el MECANISMO
// del catch/fallback (fail-open + no-cacheo del fallo), no una lectura real de `videos`
// (esa garantía ya la cubre videos.test.ts sobre obtenerVideosPorStage()).
//
// `next/cache` se mockea con una implementación mínima que preserva el único contrato
// que este archivo necesita de unstable_cache: sólo cachea una resolución EXITOSA de la
// función envuelta, nunca un throw/rechazo. Confirmado leyendo el código real instalado
// (node_modules/next/dist/server/web/spec-extension/unstable-cache.js, función
// `cacheNewResult()`): se llama únicamente después de que `cb` resolvió, nunca en la
// rama de error. Es justo lo que hace falta para probar honestamente "el catch está
// afuera de unstable_cache a propósito": con el catch en su lugar correcto, la función
// envuelta por unstable_cache (el `cb` de lib/data/videos.ts) SIEMPRE rechaza cuando la
// base falla, así que este mock jamás cachea nada — dos llamadas seguidas son dos
// intentos reales contra el mock de la base. Si alguien moviera el catch ADENTRO del
// callback de unstable_cache (que Sentry-reporte y devuelva la grilla de relleno DENTRO
// de `cb`), `cb` pasaría a RESOLVER con la grilla de relleno en vez de rechazar — este
// mock SÍ la cachearía, la segunda llamada no volvería a tocar el mock de la base, y la
// aserción "llamado 2 veces" de abajo se pondría roja. Eso es lo que ancla este archivo.

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const { limiteMock, captureExceptionMock } = vi.hoisted(() => ({
  limiteMock: vi.fn(),
  captureExceptionMock: vi.fn(),
}));

// Reemplazo mínimo de unstable_cache: cachea por JSON.stringify(args), pero sólo
// DESPUÉS de que `cb` resolvió — nunca sobre un rechazo. Ver el comentario de cabecera.
vi.mock("next/cache", () => ({
  unstable_cache: (cb: (...args: unknown[]) => Promise<unknown>) => {
    const cache = new Map<string, unknown>();
    return async (...args: unknown[]) => {
      const key = JSON.stringify(args);
      if (cache.has(key)) return cache.get(key);
      const result = await cb(...args);
      cache.set(key, result);
      return result;
    };
  },
}));

vi.mock("@sentry/nextjs", () => ({
  captureException: captureExceptionMock,
}));

// Mismo path relativo que usa lib/data/videos.ts (import { createServiceRoleClient }
// from "../supabase/service-role") — este archivo vive en lib/data/ también, así que el
// specifier resuelve exactamente al mismo módulo.
// La cadena real de obtenerVideosPorStage es select → eq → eq → not → order → limit; el
// `.limit(...)` final es lo que se awaitea, así que es el único paso con comportamiento.
vi.mock("../supabase/service-role", () => ({
  createServiceRoleClient: () => {
    const cadena = {
      select: () => cadena,
      eq: () => cadena,
      not: () => cadena,
      order: () => cadena,
      limit: limiteMock,
    };
    return { from: () => cadena };
  },
}));

const { obtenerVideosStage1, obtenerVideosStage2 } = await import("./videos");

beforeEach(() => {
  limiteMock.mockReset();
  captureExceptionMock.mockReset();
  // "La base tira": el .limit(...) final de la query (awaited por
  // obtenerVideosPorStage) devuelve un error, tal como haría supabase-js real ante una
  // falla de conexión/credenciales.
  limiteMock.mockResolvedValue({
    data: null,
    error: new Error("Falla de base simulada (VGRP-50)"),
  });
});

afterEach(() => {
  vi.clearAllMocks();
});

describe("obtenerVideosStageConFallback — fail-open cuando la base no responde (VGRP-50)", () => {
  it("stage 1: nunca propaga el error — devuelve la lista vacía (VGRP-88: ya no hay tiles de relleno)", async () => {
    await expect(obtenerVideosStage1()).resolves.toEqual([]);
  });

  it("stage 2: mismo mecanismo — lista vacía", async () => {
    await expect(obtenerVideosStage2()).resolves.toEqual([]);
  });

  it("reporta a Sentry con captureException y el tag 'videos-grilla-degradada'", async () => {
    await obtenerVideosStage1();

    expect(captureExceptionMock).toHaveBeenCalledTimes(1);
    const [error, context] = captureExceptionMock.mock.calls[0] as [unknown, unknown];
    expect(error).toBeInstanceOf(Error);
    expect(context).toMatchObject({ tags: { "videos-grilla-degradada": "true" } });
  });

  it("el fallo NO se cachea: dos llamadas seguidas con la base caída son dos intentos reales (se pondría rojo si el catch se moviera adentro de unstable_cache)", async () => {
    await obtenerVideosStage1();
    await obtenerVideosStage1();

    expect(limiteMock).toHaveBeenCalledTimes(2);
  });

  it("una vez que la base vuelve a responder, la siguiente llamada ya no cae al fallback (confirma que no quedó nada cacheado del fallo)", async () => {
    await obtenerVideosStage1(); // base caída: fallback

    limiteMock.mockResolvedValue({
      data: [
        {
          id: "v1",
          titulo: "Uno",
          descripcion: null,
          provider_ref: "dQw4w9WgXcQ",
          publicado: true,
        },
      ],
      error: null,
    }); // base recuperada
    const items = await obtenerVideosStage1();

    // Distinguible del fallback: ahora hay una fila real. La garantía es que VOLVIÓ a
    // llamar a la base (limiteMock invocado de nuevo) y devuelve lo que la base dice.
    expect(items.map((i) => i.id)).toEqual(["v1"]);
    expect(limiteMock).toHaveBeenCalledTimes(2);
  });
});
