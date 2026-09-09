# Tasks: VGRP-29 — VideoProvider y grillas de Stage 1 y Stage 2

**Status:** Implementado, pendiente `/simplify` + `/design-critique` + PR
**Last updated:** 2026-09-09
**Design:** [design-vgrp29.md](./design-vgrp29.md)
**Requirements:** [requirements-vgrp29.md](./requirements-vgrp29.md)

- [x] **29-T1 — `VideoProvider` (interfaz + YouTube no listado)**
  Satisfies: US-1
  Notes: [lib/video/provider.ts](../../lib/video/provider.ts). Interfaz `VideoProvider`
  con `urlEmbed`/`urlThumbnail`; `youtubeVideoProvider` como única implementación hoy,
  seleccionada en un solo punto (`videoProvider`). Ningún componente de UI referencia una
  URL de YouTube directamente — sólo `lib/data/videos.ts` llama a `videoProvider`.

- [x] **29-T2 — Lectura de `videos` (cacheada, gating por publicado/provider_ref)**
  Satisfies: US-2, US-3
  Notes: [lib/data/videos.ts](../../lib/data/videos.ts), `import "server-only"` (pedido
  explícito del ticket). Núcleo testable `obtenerVideosPorStage(admin, stage)` con
  cliente inyectado (mismo patrón que `lib/data/admin/contenido.ts`) + wrappers
  `obtenerVideosStage1()`/`obtenerVideosStage2()` cacheados con `unstable_cache` y el tag
  `TAG_POR_ENTIDAD.videos` (ya definido y disparado por VGRP-38 en cada escritura).
  Usa `createServiceRoleClient()` a propósito — este ticket no gatea por nivel (nota
  técnica explícita del ticket original), así que la grilla es la misma para todos.
  Tamaño fijo por stage (8/3, `CANTIDAD_STAGE`) con relleno sintético cuando hay menos
  filas reales que ese tamaño — ver requirements.md "Decisiones asumidas".
  8 tests de integración (`lib/data/videos.test.ts`) contra la base real, todos en verde,
  incluido el central de seguridad (US-3): una fila `publicado=false` con un
  `provider_ref` real no expone ese valor ni una URL derivada de él en el resultado.

- [x] **29-T3 — Marcar video como visto (`profiles.progreso`)**
  Satisfies: US-4
  Notes: [components/video/_actions.ts](../../components/video/_actions.ts) — Server
  Actions (`obtenerProgresoVideos`, `marcarVideoVisto`), mismo patrón que
  `app/(app)/comprar/_actions.ts`. `createSupabaseServerClient()` (RLS propia fila, no
  service role) — la policy `profiles_update_own` ya limita el UPDATE a `auth.uid()`, el
  `.eq("id", ...)` del código es defensa en profundidad explícita, no el único candado.
  Forma de `progreso` definida en este ticket (no había convención previa):
  `{ videosVistos: string[] }`. Idempotente (mismo id no se duplica).

- [x] **29-T4 — Contador de stats + Context de progreso**
  Satisfies: US-4
  Notes: [components/video/ProgresoVideosProvider.tsx](../../components/video/ProgresoVideosProvider.tsx)
  (Context: `vistos`, `totalVideos`, `marcarVisto`) +
  [StatsVideos.tsx](../../components/video/StatsVideos.tsx) ("X / 11 videos completados",
  MODULOS.md §2). Un solo Context envolviendo todo `InicioShell` (no uno por stage) para
  que el contador del header vea ambos stages sin duplicar el fetch inicial.

- [x] **29-T5 — Grillas (`VideoGrid`/`VideoCard`) + integración en `InicioShell`**
  Satisfies: US-2, US-4
  Depends on: 29-T2, 29-T3, 29-T4
  Notes: [VideoGrid.tsx](../../components/video/VideoGrid.tsx) (Server Component, sólo
  mapea) + [VideoCard.tsx](../../components/video/VideoCard.tsx) (Client Component:
  expandir embed in-place, sin modal; botón "Marcar como visto"). `InicioShell.tsx` pasa
  a async (lee ambos stages con `Promise.all`) y envuelve el shell en
  `<ProgresoVideosProvider>` — sigue sin `cookies()`/claims en el camino de lectura de
  videos, así que **no** rompe el rendering estático (confirmado en Tarea de
  verificación abajo). Se eliminaron los `itemsFantasma={8}`/`{3}` de esos dos
  `<SeccionSlot>` — `VideoGrid` ya entrega el tamaño fijo, real o sintético.
  **Bug propio encontrado y corregido durante la verificación en browser**: un tile
  sintético de relleno mostraba "Próximamente" dos veces (una vez como estado visual, otra
  como "título", porque `tileRelleno()` usa `"Próximamente"` como título) — corregido en
  `VideoCard.tsx` para no repetir el título quaqndo `video.id === null`.

- [x] **29-T6 — Verificación real (build, browser, mobile)**
  Depends on: 29-T1..29-T5
  Notes:
  - `pnpm typecheck` ✅, `pnpm lint` (Biome) ✅.
  - `pnpm build`: `/dashboard/[variante]` sigue listado como `●` (SSG,
    `generateStaticParams`) — leer `videos` vía `unstable_cache` no la volvió dinámica
    (mismo chequeo que VGRP-27 hizo para esta misma ruta).
  - Vitest completo (`--no-file-parallelism`, para evitar la flakiness ya documentada de
    tests que comparten `SEED_ADMIN_USER` como actor entre archivos que corren en
    paralelo): **317 passed / 10 failed (los 10 ya documentados como preexistentes,
    `MERCADOPAGO_WEBHOOK_SECRET` faltante en este entorno, sin relación con este ticket) /
    4 todo**. Con paralelismo default salió una falla adicional transitoria en
    `audit-log.test.ts` (3 filas en vez de 1) — se re-confirmó como flakiness de
    concurrencia entre archivos (mismo actor compartido), no una regresión: el archivo
    solo, en aislamiento, pasa sus 8 tests limpio.
  - **Browser real** (usuarios seed de `test/helpers/seed-users.ts`): logueado como
    `admin@test.og-circle.invalid`, se creó 1 video de prueba real vía el CRUD de VGRP-38
    (Stage 2, `provider_ref` de YouTube público, `publicado=true`). Logueado como
    `principiante@test.og-circle.invalid`: la grilla de Stage 2 mostró el video real
    (thumbnail + título) junto a 2 tiles "Próximamente" sintéticos, Stage 1 mostró 8
    tiles "Próximamente" (0 filas reales); clic en el thumbnail expandió el `<iframe>`
    correcto (`youtube.com/embed/<id>`, confirmado vía `iframe.src`); "Marcar como visto"
    actualizó el contador a "1 / 11" sin recargar, y **persistió**: tras recargar la
    página (con la carrera esperada del primer render — el Context tarda un tick en
    resolver el Server Action de lectura — confirmado con una segunda lectura post-carga)
    mostró "1 / 11" y el botón en estado "Visto". Confirmado en la base con una consulta
    SQL directa (`profiles.progreso`).
  - **Mobile** (`resize_window` preset mobile, 375×812): grilla de un tile por fila, sin
    overflow horizontal, thumbnail/título/estado "Visto" legibles.
  - **Limpieza post-verificación**: el video de prueba no se pudo borrar con un DELETE
    real desde la app (`videos` sólo soft-delete, VGRP-38) ni con `execute_sql` directo
    (el proyecto de Supabase está en modo solo-lectura para ese camino) — se usó
    `apply_migration` (mismo camino trazable ya usado en VGRP-38 para un problema
    análogo) para borrar la fila y resetear el `progreso` de prueba del usuario seed
    `principiante`. Confirmado con `pnpm build`/reinicio del dev server + limpieza de
    `.next/cache` (el dato cacheado de `unstable_cache` persiste en disco entre
    reinicios y sólo se invalida por `revalidateTag` — un DELETE por SQL directo, fuera
    del camino de la app, no lo dispara) que, con la tabla `videos` en 0 filas, ambas
    grillas se ven completas e intencionales (8 y 3 tiles "Próximamente" sintéticos) —
    criterio de aceptación del propio ticket.

## Hallazgos propios (no bloquean, documentados para la próxima sesión)

- El `<checkbox>` de `ContenidoForm.tsx` (VGRP-38) no refleja un valor seteado por
  automatización de browser vía "set value" directo (sin un click real) — el estado de
  React (`checked={Boolean(valores[...])}`) no se actualiza porque no dispara el
  `onChange`. No es un bug del componente (un click real de usuario funciona
  perfectamente, confirmado); es una limitación de la herramienta de test usada para
  esta verificación, documentada acá por si vuelve a aparecer en un futuro ticket que
  automatice ese form.
- El caché de `unstable_cache` (VGRP-29) es persistente en disco entre reinicios del dev
  server (`.next/cache`), no sólo en memoria — sólo se invalida por `revalidateTag()`.
  Cualquier limpieza de datos de `videos` que no pase por el CRUD de VGRP-38 (ej. un
  DELETE directo por SQL/migración, como el de este mismo ticket) deja la grilla
  desactualizada hasta el próximo `revalidateTag` o un borrado manual de
  `.next/cache`. Vale la pena tenerlo en cuenta para cualquier limpieza de datos futura
  sobre `videos`/`agentes`/etc.
