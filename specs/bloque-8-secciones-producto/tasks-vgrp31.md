# Tasks: VGRP-31 — Banner de la calculadora y directorio de agentes de compra

**Status:** Implementado, pendiente `/simplify` + `/design-critique` + PR
**Last updated:** 2026-09-12
**Design:** [design-vgrp31.md](./design-vgrp31.md)
**Requirements:** [requirements-vgrp31.md](./requirements-vgrp31.md)

- [x] **31-T1 — Verificación del estado real antes de tocar código**
  Notes: `AgentesGrid.tsx`/`lib/data/agentes.ts`/`ContenidoBloqueado` ya estaban
  implementados (seguimiento de VGRP-30 en la sesión del Bloque 7) — confirmado
  leyendo el código, no asumido. Sólo faltaban el CTA de la calculadora y el video
  explicativo.

- [x] **31-T2 — `videos.stage` acepta `3` (video explicativo)**
  Satisfies: "Qué hacer" (video explicativo del directorio, vía `VideoProvider`)
  Notes: Migración `20260912233815_videos_stage_explicativo.sql` (constraint
  `videos_stage_check` de `(1,2)` a `(1,2,3)`), aplicada con `apply_migration`.
  `lib/data/admin/contenido.ts` (`videoSchema.stage`) y el `<select>` de
  `ContenidoForm.tsx` actualizados para aceptar/mostrar la opción 3.
  `lib/data/videos.ts`: `CANTIDAD_STAGE[3] = 1`, `obtenerVideosStage3()` (mismo
  `obtenerVideosPorStage()` core, sin duplicar lógica). `TOTAL_VIDEOS` se deja en 11
  a propósito — el explicativo no es formación, no cuenta para "X / 11" (MODULOS.md §2).
  4 tests nuevos en `videos.test.ts` (disponible/próximamente/tamaño fijo de stage 3).

- [x] **31-T3 — CTA de la calculadora desde Edge Config**
  Satisfies: "El link de la calculadora sale de Edge Config"
  Notes: `InicioShell.tsx` llama a `getLinks()` (`lib/config`, ya implementado por
  VGRP-39 — no se reimplementa nada de Edge Config) y pasa un `<TextLink>` como
  `children` del `<SeccionSlot variante="banner">`, con `target="_blank"
  rel="noopener noreferrer"` (el link externo no navega la pestaña del dashboard).
  Clase nueva `.ctaBanner` en `inicio.module.css`, mismo look que `Button
  variant="primary"` (DESIGN.md §1: ámbar pleno nunca lleva texto blanco encima).

- [x] **31-T4 — Integración en `InicioShell`**
  Depends on: 31-T2, 31-T3
  Notes: `InicioShell` ya era async (VGRP-29) — se sumó `obtenerVideosStage3()` y
  `getLinks()` al mismo `Promise.all()`. El video explicativo se renderiza con el
  `<VideoGrid>` ya existente (una grilla de 1 tile es válida, no se creó un
  componente "video único" aparte) dentro del mismo `<SeccionSlot>` de agentes, antes
  de `<AgentesGrid />`.

- [x] **31-T5 — Verificación real**
  Depends on: 31-T2, 31-T3, 31-T4
  Notes:
  - `pnpm typecheck` ✅, `pnpm lint` ✅.
  - `pnpm build`: `/dashboard/[variante]` sigue `●` (SSG) — leer `getLinks()` y el
    video stage 3 no la volvió dinámica.
  - Vitest: 23/23 en los 3 archivos tocados (`contenido.test.ts`, `videos.test.ts`,
    `agentes.test.ts`).
  - **Browser real**: logueado como admin, se confirmó que el `<select>` de Stage ya
    ofrece la opción 3; se creó un video de test real (stage=3, `provider_ref` de
    YouTube, `publicado=true`). Logueado como el mismo admin (nivel avanzado) en
    `/dashboard`: el CTA "Abrir calculadora" apareció con el link de fallback de
    Edge Config (`ogcircle.com/calculadora` — no hay `EDGE_CONFIG` en este entorno de
    dev, comportamiento fail-open esperado) y `target="_blank"`/`rel="noopener
    noreferrer"` confirmados vía DOM; el video explicativo apareció como "disponible"
    (con botón "Marcar como visto") en la sección de agentes, antes del directorio.
    Con 0 videos de stage 3 en la tabla, la sección mostraba correctamente 1 tile
    "Próximamente" (relleno sintético). Video y fila de auditoría de prueba borrados
    al terminar, apuntando por id exacto.
  - **Nota operativa**: durante la verificación se detectó **otra sesión trabajando en
    paralelo sobre el mismo proyecto de Supabase / mismo dev server** (un video de
    prueba llamado "Prueba" en Stage 1, y cambios de viewport no hechos por esta
    sesión) — no se tocó ese dato ajeno; la limpieza de esta sesión se hizo siempre
    apuntando por id exacto, nunca con un DELETE amplio por actor o por tabla.

## Hallazgos propios (no bloquean)

- Con la pestaña del navegador en segundo plano/oculta, el `computer` tool de
  screenshot y el click por coordenada se volvieron poco confiables (coordenadas que
  no correspondían al elemento esperado, confirmado con
  `document.elementFromPoint()`). Se resolvió disparando el click real sobre el nodo
  del DOM (`button.click()`) cuando el click por coordenada fallaba dos veces
  seguidas — sigue siendo un click real de un botón real, no un atajo que salte
  lógica de la app.
