# Tasks: VGRP-38 — Panel admin: gestión de contenido

**Status:** Implementado, pendiente `/simplify` + `/design-critique` + PR
**Last updated:** 2026-09-09
**Design:** [design-vgrp38.md](./design-vgrp38.md)
**Requirements:** [requirements-vgrp38.md](./requirements-vgrp38.md)

- [x] **38-T1 — Migración de las 4 tablas + RLS**
  Satisfies: US-1
  Notes: Aplicada con `apply_migration` (MCP de Supabase, proyecto `hsmodrhbwkromoixrxrt`) y
  versionada en `supabase/migrations/20260909041306_contenido_agentes_videos_profesionales_servicios.sql`.
  `get_advisors` (security) corrido después: 0 hallazgos nuevos (los 2 que aparecen —
  `nivel_overrides` sin policy y `auth_leaked_password_protection` — son preexistentes de
  bloques anteriores). `profesionales` sin `nivel_requerido` (decisión confirmada con el
  usuario, ver requirements-vgrp38.md).

- [x] **38-T2 — Regenerar `lib/database.types.ts`**
  ESTADO: regenerado con `generate_typescript_types`. **Hallazgo propio corrigiendo esto**:
  el archivo regenerado por el MCP no trae los alias `NivelAcceso`/`RolUsuario` que el resto
  del repo importa por todos lados (`export type NivelAcceso = Database[...]`) — son un
  agregado a mano sobre el output del generador, documentado ya en la cabecera del archivo
  para los ajustes de `test_create_policy`/`test_get_policy_definition`, pero no para este
  otro caso. Se restauraron; `pnpm typecheck` pasó de ~20 errores a 0 después de eso — sin
  este chequeo hubiera roto medio repo en silencio.

- [x] **38-T3 — `lib/data/admin/contenido.ts` (CRUD genérico) + tests**
  Satisfies: US-1, US-5
  Notes: `server-only`. Lista blanca `ENTIDADES`, un schema de Zod por entidad,
  `listarContenido`/`obtenerContenido`/`crearContenido`/`actualizarContenido`/`borrarContenido`.
  `borrarContenido` en `videos` siempre hace soft-delete (`publicado=false`) — nunca DELETE
  real, por `profiles.progreso`. 8 tests de integración (`contenido.test.ts`) contra la base
  real, todos en verde: whitelist, CRUD completo de un agente, soft-delete de video, DELETE
  real de agente, `ItemNoEncontrado` en update/delete de un id inexistente.
  **Nota técnica**: el generador de tipos de Supabase no angosta `.from()` con un parámetro
  de tipo genérico (`E extends Entidad`) — distribuye sobre TODAS las tablas de `Database`.
  Se resolvió con un único helper `tabla()` con un cast documentado, sin perder tipado en
  las firmas públicas (ver el comentario grande en el archivo).

- [x] **38-T4 — Extensión de `conAuditoria()` para soportar "crear"**
  Depends on: 38-T3
  Notes: `conAuditoria()` (VGRP-35) exigía `entidadId` de antemano en `meta` — no sirve para
  "crear", donde el id no existe hasta después del insert. Se extendió `AuditoriaMeta.entidadId`
  y `ResultadoMutacion.entidadId` a opcionales (el segundo tiene prioridad), backward-compatible
  con VGRP-36/37 (`pnpm typecheck` sin errores nuevos, sus tests no se tocaron). Si ninguno de
  los dos llega, reporta a Sentry en vez de escribir un audit log con id vacío.

- [x] **38-T5 — `GET|POST /api/admin/contenido/[entidad]` + `PATCH|DELETE /api/admin/contenido/[entidad]/[id]`**
  Satisfies: US-2, US-4
  Depends on: 38-T3, 38-T4
  Notes: `requireAdmin()` primero, `:entidad` contra la lista blanca (400 si no matchea, sin
  tocar la base), `:id` validado como uuid (404 si no). `revalidateTag(TAG_POR_ENTIDAD[entidad])`
  en cada escritura exitosa. Verificado end-to-end contra la base real (no sólo típado):
  POST creó un agente real con `contacto` guardado, GET lo listó, PATCH lo editó, DELETE lo
  borró — y las 3 mutaciones aparecen en `/admin/auditoria` con el `entidad_id` correcto en
  las 3 (confirmado también con una consulta SQL directa a `admin_audit_log`, con los
  `valor_anterior`/`valor_nuevo` completos, no vacíos).

- [x] **38-T6 — Pantallas de CRUD (`app/admin/contenido/`)**
  Satisfies: US-3
  Depends on: 38-T5
  Notes: Índice (`page.tsx`) con las 4 entidades como cards — mismo patrón que
  `app/admin/page.tsx`. Listado por entidad (`[entidad]/page.tsx`, Server Component,
  lectura directa por service role). `ContenidoForm.tsx` genérico por entidad (un solo
  componente, un mapa de campos por entidad decide qué inputs mostrar) para crear
  (`[entidad]/nuevo/`) y editar (`[entidad]/[id]/`), con botón de borrar. Controles nativos
  (`<select>`/`<textarea>`/`<input>`) estilados con CSS Module local, sumados a
  `admin.module.css` (mismo archivo que ya usa el resto del panel). "Contenido" agregado a
  la nav del panel (`app/admin/layout.tsx`) y al índice (`app/admin/page.tsx`) — si no,
  quedaba construido pero no descubrible.

- [ ] **38-T7 — Cierre: `/simplify`, `/design-critique`, actualizar `STACK.md`, PR**
  Depends on: 38-T1..38-T6
  ESTADO (2026-09-09): `STACK.md` §5 y §12 actualizados (la decisión de contenido-como-TS-modules
  queda marcada como revertida, con la fecha y el ticket). `pnpm typecheck` ✅, `pnpm lint` ✅.
  Vitest completo corriendo al momento de escribir esto — se actualiza cuando termine.
  `/simplify` y `/design-critique` siguen sin estar disponibles en esta sesión.
