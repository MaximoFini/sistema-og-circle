# Tasks: VGRP-28 — Stats del usuario en el dashboard

**Status:** Implementado, pendiente `/simplify` + `/design-critique` + PR
**Last updated:** 2026-09-12
**Requirements:** [requirements-vgrp28.md](./requirements-vgrp28.md)

- [x] **28-T1 — Verificación del estado real antes de tocar código**
  Notes: "Videos completados X/11" (una sola query), "nivel activo" y el total derivado
  del contenido ya estaban hechos (VGRP-27/29). Sólo faltaban: envíos activos, y un
  estado de carga explícito para el contador.

- [x] **28-T2 — Flag `cargando` en `ProgresoVideosProvider`**
  Notes: `useState(true)` + `.finally(() => setCargando(false))` sobre la misma
  promesa de `obtenerProgresoVideos()` que ya existía — no se agregó ninguna query
  nueva, sigue siendo exactamente una.

- [x] **28-T3 — Skeleton en `StatsVideos`**
  Depends on: 28-T2
  Notes: mientras `cargando`, renderiza un `<span>` gris con `role="status"` +
  `aria-label` en vez del texto — mismo `<p>`/tamaño de fuente que el estado final, así
  que no hay salto de layout al resolver (confirmado: el HTML servido por SSR ya trae
  el skeleton, `cargando=true` de entrada). Animación de pulso respetando
  `prefers-reduced-motion` (DESIGN.md §4).

- [x] **28-T4 — "Seguimiento de envíos: próximamente"**
  Notes: texto estático en `InicioShell.tsx`, sin query — Fase 2 no tiene módulo de
  envíos (roadmap: Fase 3). Se prefirió un estado explícito a un "0" al lado de un
  contador real (podría leerse como bug). Agrupado con el contador de videos en un
  `.statsRow` nuevo en `inicio.module.css`.

- [x] **28-T5 — Verificación real**
  Notes:
  - `pnpm typecheck` ✅, `pnpm lint` ✅.
  - Browser real: confirmado por `fetch()` del propio HTML servido que el skeleton
    (`role="status"`, "Cargando progreso de videos") es lo que manda el SSR — se
    reemplaza por el conteo real recién después de hidratar y resolver la query.
  - Usuario `nivel='ninguno'`: **ni siquiera llega a `InicioShell`** — el middleware ya
    lo redirige a una pantalla dedicada ("Todavía no tenés acceso a ningún nivel" +
    CTA "Comprar acceso"), comportamiento previo a este ticket. El criterio de
    aceptación ("ve las stats sin que la pantalla parezca rota") queda satisfecho por
    esa pantalla, no por algo construido acá — documentado para que quede claro que no
    hace falta un caso especial de "stats para nivel ninguno" dentro de `StatsVideos`.
  - "Seguimiento de envíos: próximamente" confirmado visible junto al contador.

## Decisión de arquitectura documentada (no una desviación silenciosa)

El ticket original pide "envolver en `<Suspense>`". No se usó React `<Suspense>`
literal sobre un Server Component dinámico — este proyecto no tiene PPR habilitado
(`next.config.ts`), así que un Server Component dinámico ahí adentro forzaría dinámica
toda `/dashboard/[variante]`, rompiendo la regla dura de shell estático desde VGRP-27.
Se reutilizó el mismo patrón ya usado por `UserFooter`/`AgentesGrid` (Client Component +
fetch después de hidratar), que logra el mismo resultado observable (shell instantáneo,
stats después, sin salto) sin la limitación de PPR. Ver requirements-vgrp28.md,
"Decisiones asumidas".
