# Requirements: VGRP-28 — Stats del usuario en el dashboard

**Status:** Draft
**Last updated:** 2026-09-12

## Summary

Segundo ticket del Bloque 8. Pide un componente de stats (nivel activo, "X / 11
videos completados", envíos activos) resuelto con una sola query y "envuelto en
`<Suspense>`". El mecanismo de datos (videos completados) ya existe desde VGRP-29
(`ProgresoVideosProvider` + `StatsVideos`) — este ticket lo completa (envíos, estado de
carga explícito) en vez de reescribirlo.

Cubre 1 work item del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-28** — Stats del usuario en el dashboard con Suspense.

## Estado real al empezar

| Pieza pedida | Estado |
|---|---|
| "Videos completados X / 11" | ✅ Hecho (VGRP-29, `StatsVideos`/`ProgresoVideosProvider`) — 1 sola query (`obtenerProgresoVideos()` → 1 `select` a `profiles.progreso`) |
| Total de 11 derivado del contenido, no hardcodeado | ✅ Ya lo hace (`TOTAL_VIDEOS` en `lib/data/videos.ts`) |
| "Nivel activo" | ✅ Ya visible (`<h1>Nivel {variante}</h1>` en `InicioShell`) — estático, viene del segmento de URL que el middleware ya garantiza que refleja el nivel real (VGRP-27) |
| "Envíos activos" | ❌ Falta — no existe ningún indicador |
| Skeleton sin salto de layout mientras carga | ❌ Falta — hoy el contador salta directo de nada a "0 / 11" sin distinguir "todavía cargando" de "de verdad tenés 0" |

## Non-goals

- **Módulo de envíos real.** No hay envíos en Fase 2 (Fase 3, según el roadmap) — "envíos
  activos" es un estado explícito y estático, no una query nueva a ninguna tabla.
- **Reimplementar el contador de videos.** Ya existe y ya cumple "una sola query" — se
  extiende (agrega un flag de carga), no se reescribe.

## User stories

### US-1: Estado de carga explícito, sin salto de layout

Como usuario, quiero que el contador de videos no confunda "todavía está cargando" con
"tenés 0 videos vistos".

**Acceptance criteria:**

- WHILE la query de progreso no resolvió THE SYSTEM SHALL mostrar un estado de carga
  visualmente distinto de "0 / 11" (no un mismo texto ambiguo).
- THE SYSTEM SHALL NOT generar salto de layout entre el estado de carga y el estado
  final (mismo alto de línea, mismo lugar).

### US-2: Envíos activos, estado explícito

Como usuario, quiero ver que la plataforma ya tiene un lugar para mis envíos, aunque
todavía no haya ninguno.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar un texto explícito para envíos activos (no una tabla vacía,
  no un hueco en blanco) — no requiere ninguna query nueva, es contenido estático que
  documenta que el módulo llega en una fase futura.

### US-3: No rompe con nivel='ninguno'

**Acceptance criteria:**

- WHEN un usuario con `nivel='ninguno'` entra al dashboard THE SYSTEM SHALL mostrar las
  stats igual que cualquier otro usuario (el contador de videos y el estado de envíos no
  están gateados por nivel — no son contenido pago).

## Decisiones asumidas (2026-09-12)

- **No se usa React `<Suspense>` literal envolviendo un Server Component dinámico.**
  El ticket lo pide textualmente, pero este proyecto **no tiene PPR habilitado**
  (`next.config.ts` sin `experimental.ppr`, confirmado leyendo el archivo) — sin PPR,
  cualquier Server Component que use una API dinámica (`cookies()`/claims) dentro de
  `/dashboard/[variante]` (ruta con `generateStaticParams` + `dynamicParams=false`)
  fuerza TODA la ruta a dinámica, aunque esté envuelto en `<Suspense>`. Es exactamente
  la razón documentada desde VGRP-27 por la que `UserFooter`/`AgentesGrid`/
  `StatsVideos` son Client Components que hacen fetch después de hidratar, no Server
  Components en Suspense — y es el mismo patrón que este ticket reutiliza (Bloque 8:
  "no hay ninguna decisión de arquitectura nueva"). Habilitar PPR sería una decisión de
  arquitectura real, fuera del alcance de "aplicar patrones ya cerrados" — no se toma
  acá sin que el equipo la decida explícitamente.
- **"Envíos activos"**: estado explícito ("Seguimiento de envíos: próximamente"), no un
  simple "0" — un cero al lado de un contador real (3/11) puede leerse como un bug; un
  texto explícito no.
