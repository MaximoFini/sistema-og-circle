# Tasks: VGRP-32 — Profesionales y servicios financieros

**Status:** Implementado, pendiente `/simplify` + `/design-critique` + PR
**Last updated:** 2026-09-12
**Requirements:** [requirements-vgrp32.md](./requirements-vgrp32.md)

Último ticket del Bloque 8.

- [x] **32-T1 — Duda de negocio resuelta con fuente citada**
  Notes: la propia PRD "Fase 2 — MVP para cobrar" §1.1 confirma: servicios financieros
  está en ambos niveles, SWIFT es exclusivo de Avanzado. Documentado en
  requirements-vgrp32.md y en requirements-vgrp33.md (donde se encontró primero). Sigue
  pendiente la confirmación explícita de Jota — no bloqueante para implementar.

- [x] **32-T2 — `lib/data/profesionales.ts` (sin gating por nivel)**
  Satisfies: US-1
  Notes: mismo criterio arquitectónico que `agentes` (server-only, dinámico) pero sin
  ninguna condición de nivel — la tabla no tiene `nivel_requerido` (VGRP-38). 3 tests de
  integración.

- [x] **32-T3 — `lib/data/servicios.ts` (gating de FILA completa)**
  Satisfies: US-2
  Notes: a diferencia de agentes (publicMeta+secret en la misma fila), acá se gatea la
  fila entera — `titulo` siempre visible, `descripcion` (donde vive el contenido real,
  incluido SWIFT) resuelta con `resolverSecreto()`. 4 tests de integración, incluido el
  central de seguridad: un string de SWIFT nunca aparece serializado en la respuesta
  para un nivel insuficiente.

- [x] **32-T4 — Route Handlers + Grids + integración**
  Depends on: 32-T2, 32-T3
  Notes: `/api/profesionales`, `/api/servicios-financieros` (mismo patrón dinámico que
  `/api/agentes`). `ProfesionalesGrid.tsx` (sin `<ContenidoBloqueado>`, nada que
  bloquear) y `ServiciosFinancierosGrid.tsx` (con `<ContenidoBloqueado>` envolviendo
  sólo la descripción, nunca el título). Reemplazan los `itemsFantasma` de
  `InicioShell.tsx`. Banner de comunidad: sin cambios, ya estaba (VGRP-27).

- [x] **32-T5 — Verificación real**
  Notes:
  - `pnpm typecheck` ✅, `pnpm lint` ✅, `pnpm build` ✅ (`/api/profesionales` y
    `/api/servicios-financieros` → `ƒ`, `/dashboard/[variante]` sigue `●`).
  - Vitest: 7/7 nuevos tests en verde.
  - **Browser real** con datos de prueba (1 profesional, 2 servicios — uno
    `principiante`, uno `avanzado` con un string secreto distintivo):
    - Como Principiante: profesional visible con contacto (sin candado); "Gestión
      financiera general" visible completo; "Pagos vía SWIFT" con **título visible**
      pero descripción bloqueada + "Disponible desde nivel Avanzado" + CTA — el string
      secreto confirmado ausente tanto en el HTML como en la respuesta cruda de
      `/api/servicios-financieros` (inspeccionada en Network).
    - Como Avanzado: "Pagos vía SWIFT" muestra el contenido completo.
    - Mobile (375×812): ambas secciones sin overflow horizontal.
  - Datos de prueba borrados al terminar, apuntando por id exacto.

## Cierre del Bloque 8

Con este ticket, los 4 de "Las secciones del producto" (VGRP-31, 28, 33, 32) quedan
implementados y verificados. Criterio de cierre del bloque (según la guía "Orden
Implementaciones" de Plane): las cuatro secciones funcionan en mobile ✅, un usuario
`nivel='ninguno'` recorre todo el dashboard sin nada roto (bloqueo con CTA, no un hueco)
✅, y la verificación de bundle del Bloque 7 (nada de `agentes.contacto`/SWIFT en el
HTML estático) se repite sobre las pantallas nuevas y sigue dando limpia ✅ (confirmado
con la inspección de red de este ticket).
