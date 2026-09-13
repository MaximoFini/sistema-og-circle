# Requirements: VGRP-31 — Banner de la calculadora y directorio de agentes de compra

**Status:** Draft
**Last updated:** 2026-09-12

## Summary

Primer ticket del Bloque 8 ("Las secciones del producto") — sin decisiones de
arquitectura nueva, aplica los patrones ya cerrados en el Bloque 7 (gating,
`VideoProvider`, shell). Dos piezas de las cuatro que pide el ticket **ya están
implementadas** como seguimiento de VGRP-30/29 en una sesión anterior; este ticket
cierra las dos que faltan.

Cubre 1 work item del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-31** — Banner de la calculadora y directorio de agentes de compra.

## Estado real al empezar (verificado leyendo el código, no asumido)

| Pieza pedida por el ticket | Estado |
|---|---|
| Grilla del directorio de 6 agentes | ✅ Hecho (`AgentesGrid.tsx`, `lib/data/agentes.ts`, `/api/agentes` — seguimiento de VGRP-30) |
| Componente de bloqueo sobre el contacto | ✅ Hecho (`ContenidoBloqueado`, mismo seguimiento) |
| Banner con link a la calculadora, desde Edge Config | ❌ Falta — hoy el slot "Calculadora de costos" en `InicioShell.tsx` es sólo texto, sin ningún link/CTA |
| Video explicativo del directorio, vía `VideoProvider` | ❌ Falta — no existe ningún video fuera de Stage 1/2 |

## Goals

- Banner de la calculadora con un CTA real, cuyo `href` sale de `lib/config`
  (`getLinks().calculadora`, ya implementado por VGRP-39 — no se reimplementa nada de
  Edge Config acá).
- El link abre en pestaña nueva (no navega afuera del dashboard en la misma pestaña).
- Un video explicativo del directorio de agentes, usando la misma infraestructura de
  VGRP-29 (`VideoProvider`, tabla `videos`, gating por `publicado`/`provider_ref`).

## Non-goals

- **Reconstruir o migrar la calculadora** — sigue siendo un link externo
  (`vegroup.vercel.app/calculadora` hoy, cambiable desde Edge Config sin deploy).
  Decisión ya registrada en el ticket original, no se revisita acá.
- **Cargar los 6 agentes reales ni el video real** — sigue sin inventarse contenido de
  negocio (mismo criterio que VGRP-38/29). La tabla `agentes` sigue vacía; el video
  explicativo se prueba con una fila de test, no con el video real (no está grabado).
- **Tocar el link de la calculadora en el drawer de navegación**
  (`components/nav/destinos.ts`) — sigue hardcodeado. Ver Decisiones asumidas.

## User stories

### US-1: Banner de la calculadora con link real desde Edge Config

Como usuario logueado, quiero un acceso directo a la calculadora de costos desde
Inicio, sin perder mi lugar en el dashboard.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar un CTA en el slot "Calculadora de costos" cuyo `href` sea
  `getLinks().calculadora` (Edge Config), no un valor hardcodeado en el componente.
- WHEN se hace click en el CTA THE SYSTEM SHALL abrirlo en una pestaña nueva
  (`target="_blank" rel="noopener noreferrer"`) — la pestaña del dashboard queda intacta.
- IF cambia el valor de `links.calculadora` en Edge Config THEN THE SYSTEM SHALL
  reflejar el nuevo link sin deploy (ya lo garantiza `getLinks()`, fail-open a un
  default hardcodeado si Edge Config no responde).

### US-2: Video explicativo del directorio de agentes

Como usuario logueado, quiero un video corto que me explique cómo usar el directorio
de agentes antes de contactarlos.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar un único video en la sección de agentes, resuelto por
  `VideoProvider` (mismo mecanismo de VGRP-29 — ningún componente importa una URL de
  YouTube directamente).
- WHEN el video no está publicado o no tiene `provider_ref` THE SYSTEM SHALL mostrarlo
  en estado "próximamente" (mismo criterio que Stage 1/2) — nunca una sección rota.
- THE SYSTEM SHALL NOT gatear este video por nivel (mismo criterio de VGRP-29: la
  formación/explicación es igual para ambos niveles pagos).

## Constraints

- **Reutilización obligatoria:** `getLinks()` (`lib/config`), `VideoProvider`
  (`lib/video/provider.ts`), `lib/data/videos.ts` (extendido, no reimplementado),
  `TextLink`/`Button` (`components/ui`). Nada de esto se reescribe.
- **CI en verde:** typecheck + `biome ci` + build (confirmar que `/dashboard/[variante]`
  sigue estática) + Vitest.

## Decisiones asumidas (2026-09-12)

- **`videos.stage` pasa a aceptar `3`** (antes sólo `1`/`2`) para el video explicativo,
  reusando la tabla y todo el mecanismo de VGRP-29 en vez de inventar una tabla o un
  campo nuevo — es la extensión más chica posible sobre un patrón ya cerrado, coherente
  con lo que el propio Bloque 8 pide ("no hay ninguna decisión de arquitectura nueva").
  `CANTIDAD_STAGE` gana la entrada `3: 1` (grilla de tamaño fijo 1, mismo criterio de
  relleno sintético que Stage 1/2 si la fila no existe todavía).
- **El link de la calculadora en el drawer de navegación (`components/nav/destinos.ts`)
  sigue hardcodeado**, no se migra a Edge Config en este ticket. Ese archivo es parte
  del shell 100% estático (VGRP-27, regla dura: cero llamadas dinámicas en el layout) —
  convertirlo en dinámico para leer Edge Config rompería esa garantía por un beneficio
  menor (es sólo el link del menú, no una superficie de negocio). Queda como
  inconsistencia conocida: dos lugares con el link de la calculadora, uno dinámico
  (el banner de Inicio, este ticket) y uno estático (el drawer). Documentado para que
  el equipo lo revise si algún día importa de verdad.
