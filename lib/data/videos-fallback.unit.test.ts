// VGRP-53 — tests unitarios (mockeados, sin Postgres real) del hallazgo real de este
// ticket: `obtenerVideosStage3()` NO tenía el mismo fail-open que Stage 1/2.
//
// `obtenerVideosStageConFallback()` (el fix de 57ebd28) envuelve la lectura cacheada en
// try/catch y degrada a tiles de relleno si la base falla — pero antes de este ticket
// sólo se usaba para stage 1 y 2. `obtenerVideosStage3()` llamaba DIRECTO a
// `obtenerVideosPorStageCached(3)`, sin try/catch. Como `InicioShell` resuelve
// stage1/stage2/stage3/links con un único `Promise.all`, si la lectura de stage 3 fallaba
// durante `next build`, TODO el `Promise.all` rechazaba — volteando la ruta estática
// entera (`/dashboard/[variante]`), el mismo incidente que 57ebd28 vino a evitar para
// Stage 1/2 (ver el comentario grande de `obtenerVideosStageConFallback` en ./videos.ts).
//
// DECISIÓN (VGRP-53, punto 1): se optó por la opción (b) — extender el fallback a stage 3
// en vez de sólo documentar el hallazgo — por ser un cambio chico y de bajo riesgo
// (tipar `grillaDeRelleno`/`obtenerVideosStageConFallback` para stage 1|2|3 y hacer que
// `obtenerVideosStage3()` pase por el mismo wrapper). Este archivo cubre el comportamiento
// YA CORREGIDO: los tres stages degradan igual ante un fallo de base.
//
// QUÉ SE EJERCITA Y QUÉ NO (dejado explícito, como pide el ticket):
// - `next/cache`'s `unstable_cache` se mockea como identidad (`(fn) => fn`): no hay
//   contexto de request de Next.js bajo Vitest para que la implementación real funcione,
//   así que este archivo NO ejercita el mecanismo real de caching/`revalidateTag` de
//   `unstable_cache` — sólo el try/catch de `obtenerVideosStageConFallback` alrededor de
//   lo que sea que esa función envuelva. La memoización real ya la ejercita el hecho de
//   que este mismo `unstable_cache` se usa desde hace VGRP-29 sin bugs reportados, y no es
//   el objeto de este ticket.
// - `createServiceRoleClient()` se mockea para devolver un cliente falso cuyo
//   `.from("videos").select().eq().order()` resuelve `{ data: null, error: {...} }` —
//   simula una base que responde con error (el caso real: service role key vencida,
//   Postgres caído, etc.), no una excepción de red sin resolver. `obtenerVideosPorStage()`
//   (lib/data/videos.ts) hace `if (error) throw error;`, así que este camino SÍ ejercita
//   la propagación real de ese `throw` hacia arriba, a través de `obtenerVideosPorStage`.
// - Complementa (no reemplaza) a lib/data/videos.test.ts, que cubre `obtenerVideosPorStage`
//   con el cliente admin real de test contra la base real — ese archivo no toca el
//   wrapper de fallback en absoluto.

import { beforeEach, describe, expect, it, vi } from "vitest";

const mockCaptureException = vi.fn();
vi.mock("@sentry/nextjs", () => ({
  captureException: (...args: unknown[]) => mockCaptureException(...args),
}));

// Pass-through: ver "QUÉ SE EJERCITA Y QUÉ NO" arriba.
vi.mock("next/cache", () => ({
  unstable_cache: (fn: (...args: unknown[]) => unknown) => fn,
}));

const mockCreateServiceRoleClient = vi.fn();
vi.mock("@/lib/supabase/service-role", () => ({
  createServiceRoleClient: () => mockCreateServiceRoleClient(),
}));

/** Cliente Supabase falso: `.from("videos").select(...).eq(...).order(...)` resuelve un
 *  error, simulando que la base no responde (service role vencida, Postgres caído, etc). */
function fakeFailingClient() {
  const order = vi.fn().mockResolvedValue({
    data: null,
    error: { message: "conexión rechazada", code: "ECONNREFUSED" },
  });
  const eq = vi.fn().mockReturnValue({ order });
  const select = vi.fn().mockReturnValue({ eq });
  const from = vi.fn().mockReturnValue({ select });
  return { from };
}

describe("obtenerVideosStage1/2/3 — fail-open ante una base que falla (VGRP-53, hallazgo del punto 1)", () => {
  beforeEach(() => {
    vi.resetModules();
    mockCaptureException.mockReset();
    mockCreateServiceRoleClient.mockReset();
    mockCreateServiceRoleClient.mockReturnValue(fakeFailingClient());
  });

  it("stage 1 y 2 degradan a tiles de relleno en vez de propagar (comportamiento ya existente, 57ebd28 — control)", async () => {
    const { obtenerVideosStage1, obtenerVideosStage2, CANTIDAD_STAGE } = await import("./videos");

    const s1 = await obtenerVideosStage1();
    const s2 = await obtenerVideosStage2();

    expect(s1).toHaveLength(CANTIDAD_STAGE[1]);
    expect(s1.every((v) => v.id === null && v.estado === "proximamente")).toBe(true);
    expect(s2).toHaveLength(CANTIDAD_STAGE[2]);
    expect(s2.every((v) => v.id === null && v.estado === "proximamente")).toBe(true);
    expect(mockCaptureException).toHaveBeenCalledTimes(2);
  });

  it("stage 3 (VGRP-53, con el fix aplicado) TAMBIÉN degrada a 1 tile de relleno — antes de este fix, esto rechazaba y volteaba el Promise.all de InicioShell en build", async () => {
    const { obtenerVideosStage3, CANTIDAD_STAGE } = await import("./videos");

    const s3 = await obtenerVideosStage3();

    expect(s3).toHaveLength(CANTIDAD_STAGE[3]);
    expect(s3[0]?.id).toBeNull();
    expect(s3[0]?.estado).toBe("proximamente");
    expect(mockCaptureException).toHaveBeenCalledTimes(1);
    const [, opciones] = mockCaptureException.mock.calls[0];
    expect(opciones).toMatchObject({ tags: { "videos-grilla-degradada": "true" } });
  });

  it("el Promise.all combinado que usa InicioShell (stage1+stage2+stage3) nunca rechaza cuando la base falla — la garantía real que protege este ticket", async () => {
    const { obtenerVideosStage1, obtenerVideosStage2, obtenerVideosStage3 } = await import(
      "./videos"
    );

    await expect(
      Promise.all([obtenerVideosStage1(), obtenerVideosStage2(), obtenerVideosStage3()]),
    ).resolves.toBeDefined();
  });

  it("el núcleo obtenerVideosPorStage(admin, 3) SÍ propaga el error tal cual, para cualquier stage — es el wrapper, no el núcleo, el que tiene que atajarlo", async () => {
    const { obtenerVideosPorStage } = await import("./videos");
    const admin = fakeFailingClient();

    await expect(
      obtenerVideosPorStage(admin as unknown as Parameters<typeof obtenerVideosPorStage>[0], 3),
    ).rejects.toMatchObject({ message: "conexión rechazada" });
  });
});
