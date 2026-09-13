# Requirements: VGRP-32 — Profesionales y servicios financieros

**Status:** Draft
**Last updated:** 2026-09-12

## Summary

Último ticket del Bloque 8. Dos secciones de `InicioShell` que hoy son grillas
fantasma, sobre patrones ya cerrados en el Bloque 7 (mismo mecanismo que
`AgentesGrid`/`lib/data/agentes.ts`) — sin decisión de arquitectura nueva.

Cubre 1 work item del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-32** — Secciones de profesionales al servicio y servicios financieros.

## Duda abierta del ticket — resuelta con fuente

El propio ticket pide confirmar con Jota si "servicios financieros" es de ambos niveles
con sólo SWIFT exclusivo de Avanzado. Encontrado y citado en VGRP-33
(requirements-vgrp33.md): la PRD "Fase 2 — MVP para cobrar" §1.1 dice literal:

> Principiante — [...] servicios financieros. Avanzado — Todo lo anterior + [...] SWIFT.

Se procede con esa lectura (documentada, no inventada). **Confirmado (2026-09-13)**: un
Principiante ve título y descripción de "Servicios financieros" en general, con los
datos SWIFT específicamente bloqueados y un cartel de "mejorá tu nivel" — exactamente
el mecanismo ya implementado (`ContenidoBloqueado` sobre la descripción de la fila
`nivel_requerido='avanzado'`, título siempre visible). Sin ambigüedad de negocio
pendiente.

## Estado real al empezar

| Pieza pedida | Estado |
|---|---|
| Banner de comunidad, "próximamente" | ✅ Ya existe (`InicioShell.tsx`, VGRP-27) |
| Sección de profesionales (grilla real) | ❌ Falta — hoy es `itemsFantasma={4}` |
| Sección de servicios financieros (grilla real, gateada) | ❌ Falta — hoy es `itemsFantasma={3}` |

## Goals

- `lib/data/profesionales.ts` — mismo mecanismo que `lib/data/agentes.ts`, pero SIN
  gating por nivel (la tabla no tiene `nivel_requerido` — decisión ya confirmada en
  VGRP-38): `contacto` se resuelve para cualquier usuario autenticado, nunca para
  claims `null`. Server-only, nunca en el HTML estático del dashboard.
- `lib/data/servicios.ts` — mismo mecanismo pero con gating POR FILA: a diferencia de
  `agentes` (publicMeta + secret dentro de la misma fila), acá la fila entera
  (`titulo`+`descripcion`) es lo que se gatea. `titulo` siempre visible (nunca
  desaparece sin explicación — regla del PRD §6); `descripcion` (donde vive el
  contenido real, incluido SWIFT en las filas `nivel_requerido='avanzado'`) sólo se
  resuelve si el nivel alcanza.
- `AgentesGrid`-equivalentes: `ProfesionalesGrid.tsx`, `ServiciosFinancierosGrid.tsx`
  (Client Components, fetch a Route Handlers dinámicos nuevos).
- Integrar en `InicioShell.tsx`, reemplazando los `itemsFantasma`.

## Non-goals

- **Banner de comunidad** — ya está (VGRP-27), no se toca.
- **Cargar contenido real** (los 4 profesionales, los servicios financieros reales) —
  mismo criterio que VGRP-38/29/31: tablas vacías, Jota carga desde el panel.
- **Calculadora de costos locales** (mencionada en "Qué hacer") — no hay ninguna tabla
  ni ticket que defina esto como algo separado de la calculadora externa ya resuelta
  (VGRP-31); se interpreta como parte de la descripción de la sección de servicios
  financieros, no como una pieza nueva de producto.

## User stories

### US-1: Sección de profesionales, sin gating por nivel

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar nombre/rubro de cada profesional activo a cualquier usuario
  autenticado, con `contacto` resuelto igual (sin candado — decisión de VGRP-38).
- THE SYSTEM SHALL NOT permitir que `profesionales.contacto` llegue al HTML estático de
  `/dashboard/[variante]` — se resuelve siempre por un Route Handler dinámico, mismo
  criterio arquitectónico que `agentes` (aunque acá no haya nada que bloquear
  visualmente).

### US-2: Sección de servicios financieros, gateada por fila

**Acceptance criteria:**

- WHEN una fila tiene `nivel_requerido` que el usuario alcanza THE SYSTEM SHALL mostrar
  título y descripción completos.
- WHEN una fila tiene `nivel_requerido` que el usuario NO alcanza THE SYSTEM SHALL
  mostrar el título (nunca desaparece sin explicación) y bloquear la descripción con
  `ContenidoBloqueado`, indicando qué nivel la desbloquea.
- IF una fila con `nivel_requerido='avanzado'` contiene datos de SWIFT THEN THE SYSTEM
  SHALL NOT incluir esa `descripcion` en ninguna respuesta a un usuario Principiante —
  verificado con un test que confirma que el string no aparece serializado, no sólo que
  el campo da `null` (mismo criterio que `agentes.test.ts`/`videos.test.ts`).

### US-3: Ambas secciones funcionan en mobile

**Acceptance criteria:**

- THE SYSTEM SHALL renderizar ambas grillas sin overflow horizontal en mobile (375px).

## Constraints

- **Reutilización obligatoria:** `resolverSecreto()`, `ContenidoBloqueado`,
  `createServiceRoleClient()`, `getVerifiedClaims()` — ningún mecanismo se reimplementa.
- **CI en verde:** typecheck + `biome ci` + build + Vitest, incluido el test de
  seguridad de US-2 (string de SWIFT nunca serializado para un nivel insuficiente).

## Decisiones asumidas (2026-09-12)

- **Profesionales**: se sigue el mismo criterio arquitectónico que agentes
  (server-only, dinámico, nunca en HTML estático) aunque no haya ninguna condición de
  nivel que evaluar — es disciplina de dónde vive el dato, no un candado visual. No se
  envuelve el contacto en `<ContenidoBloqueado bloqueado={false}>` (sería un componente
  de bloqueo que nunca bloquea, ruido sin función) — se muestra directo una vez resuelto
  por el Route Handler.
- **Servicios financieros**: gating a nivel de FILA completa (título siempre visible,
  descripción como el "secreto"), no un split publicMeta/secret dentro de la misma fila
  como agentes — es la lectura más simple y fiel al schema real (no hay una columna
  separada tipo "swift_data"; la información sensible vive en `descripcion`).
