# Requirements: VGRP-38 — Panel admin: gestión de contenido

**Status:** Draft
**Last updated:** 2026-09-09

## Summary

Crea las 4 tablas de contenido de la plataforma (`agentes`, `videos`, `profesionales`,
`servicios_financieros`) con CRUD completo en el panel de admin, para que Jota pueda
cargar y corregir contenido sin pedirle nada al equipo de desarrollo. **Decisión cerrada**
(PRD, "Decisiones tomadas" §7): todo el contenido va a base de datos, videos incluidos,
aunque casi no cambien — es la red de seguridad de poder corregirlos sin deploy. El costo
se compensa con rendering estático + `revalidateTag`.

Cubre 1 work item del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-38** — Panel admin: gestión de contenido (agentes, videos, profesionales,
  servicios).

Ya no está bloqueado por ninguna decisión abierta (a diferencia de cuando se registró:
"Va antes que las grillas porque crea las tablas de las que ellas leen").

## Goals

- Migración de las 4 tablas con RLS, siguiendo el mismo patrón ya usado en
  `supabase/migrations/20260822035923_init_plataforma.sql` (grants explícitos +
  policies con `(select auth.jwt())`/`(select auth.uid())` envueltos en subselect).
- `GET|POST|PATCH|DELETE /admin/contenido/:entidad`, con `:entidad` validado contra una
  lista blanca — nunca ejecuta contra una tabla arbitraria.
- Pantallas de CRUD para las 4 entidades, con orden y estado activo/publicado por ítem.
- `revalidateTag` sobre las grillas afectadas en cada escritura exitosa.
- Cada creación, edición y borrado pasa por `conAuditoria()` (mismo helper de VGRP-35,
  no se reimplementa).

## Non-goals

- **Las grillas que leen esta base** (Stage 1/2, directorio de agentes real) — es VGRP-29.
  Este ticket sólo dejar el contenido cargable; consumirlo es el ticket siguiente.
- **Cargar el contenido real de negocio** (los 6 agentes reales, los 4 profesionales
  reales, los textos de servicios financieros) — eso es tarea de Jota, usando el CRUD que
  este ticket construye. Este ticket no inventa datos de negocio reales; ver Open
  questions sobre qué significa exactamente "cargar el contenido inicial" del ticket
  original.
- **Los 11 videos reales** — no están grabados. Se cargan como filas con
  `publicado = false` (placeholder), no con contenido de video real.
- **Reemplazar `content/agentes-demo.ts`** en el mismo commit que crea la tabla — es un
  paso aparte (borrar el demo y conectar VGRP-30/AgentesDemo a la tabla real), para no
  mezclar "crear la tabla" con "migrar el consumidor" en una sola PR. Ver Open questions.

## User stories

### US-1: Las 4 tablas de contenido, con RLS

Como admin, quiero que el contenido viva en base de datos con las mismas garantías de
seguridad que el resto del sistema, para poder editarlo sin deploy sin debilitar el
gating por nivel.

**Acceptance criteria:**

- THE SYSTEM SHALL crear las tablas `agentes`, `videos`, `profesionales`,
  `servicios_financieros` según la forma de PRD §4.5:
  - `agentes` — nombre, especialidad, `nivel_requerido`, `contacto` (sensible), orden,
    activo.
  - `videos` — stage (1|2), título, descripción, `provider_ref` (sensible), `nivel_requerido`,
    orden, publicado.
  - `profesionales` — nombre, rubro, descripción, contacto, orden, activo. **Sin
    `nivel_requerido`** (no está en la forma de datos de la PRD — ver Open questions).
  - `servicios_financieros` — título, descripción, `nivel_requerido`, orden, activo.
- THE SYSTEM SHALL activar RLS en las 4 tablas.
- WHEN un usuario autenticado hace una consulta directa a `agentes`, `videos` o
  `servicios_financieros` THE SYSTEM SHALL devolver únicamente las filas cuyo
  `nivel_requerido` sea alcanzado por el nivel del claim del usuario — nunca filas de un
  nivel superior, sea cual sea el cliente que arme la consulta.
- THE SYSTEM SHALL otorgar `grant all` a `service_role` en las 4 tablas y revocar todo a
  `anon`/`authenticated` salvo el `select` filtrado por la policy.
- THE SYSTEM SHALL NOT permitir INSERT/UPDATE/DELETE desde `authenticated` en ninguna de
  las 4 tablas — sólo `service_role` (vía el panel) escribe contenido.

### US-2: CRUD con lista blanca de entidades

Como admin, quiero un único conjunto de endpoints para las 4 entidades de contenido, sin
que sea posible apuntar a una tabla que no corresponde.

**Acceptance criteria:**

- WHEN un admin hace `GET|POST|PATCH|DELETE /admin/contenido/:entidad` THE SYSTEM SHALL
  validar `:entidad` contra la lista blanca exacta (`agentes`, `videos`, `profesionales`,
  `servicios_financieros`) antes de tocar la base.
- IF `:entidad` no está en la lista blanca THEN THE SYSTEM SHALL responder `400` sin
  ejecutar ninguna consulta.
- THE SYSTEM SHALL aplicar `requireAdmin()` antes de cualquier lógica, mismo criterio que
  el resto de `/api/admin/*` (401 sin sesión, 404 sin rol admin — nunca 403).
- THE SYSTEM SHALL validar el body de cada escritura con Zod, con un schema específico
  por entidad (los campos no son los mismos entre `agentes` y `videos`).
- WHEN una escritura tiene éxito THE SYSTEM SHALL registrar la acción con
  `conAuditoria()` (`entidad` = el nombre de la tabla, `entidadId` = el id de la fila).

### US-3: Pantallas de CRUD por entidad

Como admin, quiero ver, crear, editar, reordenar y activar/desactivar cada ítem desde una
pantalla del panel.

**Acceptance criteria:**

- WHEN un admin abre `/admin/contenido/:entidad` THE SYSTEM SHALL listar los ítems de esa
  entidad ordenados por el campo `orden`.
- THE SYSTEM SHALL permitir editar el campo `orden` y el estado `activo`/`publicado` de
  cada ítem sin tener que borrar y recrear la fila.
- THE SYSTEM SHALL usar controles nativos (`<select>`/`<textarea>` estilados con CSS
  Module local) para los formularios — mismo criterio ya aplicado en
  `specs/bloque-5-panel-admin/design.md` para el panel de usuarios.

### US-4: `revalidateTag` — las grillas siguen estáticas

Como usuario final, quiero seguir recibiendo las grillas de contenido servidas desde el
CDN, aunque el contenido ahora viva en base de datos.

**Acceptance criteria:**

- WHEN una escritura en cualquiera de las 4 tablas tiene éxito THE SYSTEM SHALL disparar
  `revalidateTag()` sobre el/los tags de las grillas afectadas.
- THE SYSTEM SHALL NOT convertir ninguna página de grilla en dinámica por el sólo hecho
  de leer de base — verificable en el output de `pnpm build` (mismo criterio que VGRP-27
  confirmó para `/dashboard/[variante]`).
- Nota: esta AC se termina de verificar en VGRP-29 (que es quien construye las grillas
  reales) — este ticket deja el mecanismo (`revalidateTag` en cada escritura) listo para
  que ese ticket lo consuma.

### US-5: El gating no se debilita al mover contenido a base

Como responsable del producto, quiero que mover el contenido de TypeScript a Postgres no
abra una vía nueva para filtrar secretos.

**Acceptance criteria:**

- THE SYSTEM SHALL exigir `import "server-only"` en todo archivo de `lib/data/admin/*`
  que lea o escriba `agentes.contacto` o `videos.provider_ref`.
- WHEN el admin lee el listado de `agentes` o `videos` en el panel THE SYSTEM SHALL
  poder mostrar el campo sensible (el admin ve todo, es su trabajo) — esto es distinto
  del consumo en la app pública (VGRP-29/VGRP-30), que sigue pasando por
  `resolverSecreto()`.
- IF se borra un video THEN THE SYSTEM SHALL usar `activo = false` (soft-delete), nunca
  un `DELETE` real — `profiles.progreso` referencia videos por id (PRD §4.1) y un DELETE
  real rompería el progreso ya guardado de usuarios reales.
- THE SYSTEM SHALL aplicar el mismo criterio de soft-delete a cualquier entidad
  referenciada desde otro lado; hoy sólo `videos` tiene esa referencia conocida
  (`profiles.progreso`).

### US-6: Contenido inicial cargable, no inventado

Como equipo, queremos que el panel quede listo para que Jota cargue el contenido real
apenas esté disponible, sin que el ticket invente datos de negocio.

**Acceptance criteria:**

- THE SYSTEM SHALL dejar las 4 tablas vacías (o con a lo sumo un ítem de ejemplo
  claramente marcado `activo = false` para verificar el CRUD) al cerrar este ticket —
  no se inventan 6 agentes ni 4 profesionales reales.
- Ver Open questions sobre qué hacer específicamente con los 11 videos (placeholder de
  fila vs. no crear ninguna fila todavía).

## Constraints

- **Reutilización obligatoria:** `requireAdmin()` (`lib/auth/admin.ts`), `conAuditoria()`
  / `registrarAccionAdmin()` (`lib/data/admin/audit-log.ts`), `createServiceRoleClient()`
  — ninguno se reimplementa.
- **Mismo patrón de RLS que `init_plataforma.sql`:** `(select auth.jwt())` / `(select
  auth.uid())` envueltos en subselect (optimización recomendada por Supabase), nunca una
  subquery a `profiles` para leer nivel — se lee del claim.
- **Migraciones:** se aplican con `apply_migration` del MCP de Supabase (proyecto
  `og-circle` / `hsmodrhbwkromoixrxrt` / `sa-east-1`) y se versionan en
  `supabase/migrations/`.
- **`lib/database.types.ts` se regenera** (`generate_typescript_types`) después de aplicar
  las migraciones — es el archivo generado real, no se edita a mano (mismo criterio que
  `docs/SUPABASE-SETUP.md`).
- **CI en verde:** typecheck + `biome ci` + build + Vitest. Cada endpoint necesita un test
  de que un no-admin no puede usarlo y de que `:entidad` fuera de la lista blanca da 400.
- **Actualizar `STACK.md`** — el propio ticket lo pide: esta decisión reemplaza la
  arquitectura de contenido como módulos TypeScript de `STACK.md` §3 y §5.

## Decisiones confirmadas (2026-09-09)

- **RLS de `profesionales`:** sin `nivel_requerido`, sin candado propio — cualquier
  usuario autenticado con nivel pago las ve igual (mismo criterio que los videos,
  VGRP-29). No se agrega la columna.
- **Contenido inicial:** las 4 tablas quedan **vacías** al cerrar este ticket (a lo sumo
  un ítem de ejemplo con `activo=false` para probar el CRUD a mano). No se inventan
  agentes, profesionales ni servicios reales — Jota carga el contenido real desde el
  panel una vez construido.
- **`content/agentes-demo.ts` (VGRP-30):** queda para después. Este ticket no lo toca ni
  lo reemplaza — sólo crea la tabla `agentes` y su CRUD.
