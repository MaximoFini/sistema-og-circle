-- =============================================================================
-- VGRP-35 / Bloque 5 — Índices en admin_audit_log para la pantalla de auditoría
-- =============================================================================
-- Escrita a mano siguiendo el mismo criterio que las migraciones previas de
-- este repo (20260822035923_init_plataforma.sql, 20260905023031_nivel_vigente_
-- precedencia.sql): esta máquina no tiene el Supabase CLI ni el MCP de Supabase
-- autorizado apuntando al proyecto (`list_projects` devolvió vacío al
-- implementar VGRP-35), así que NO fue posible aplicarla con `apply_migration`
-- ni correr `get_advisors` después. Revisada línea por línea contra
-- design.md §"VGRP-35 — índices en admin_audit_log".
--
-- Antes de aplicarla en el proyecto real (og-circle, ref hsmodrhbwkromoixrxrt,
-- región sa-east-1 — ver docs/SUPABASE-SETUP.md):
--   1. `apply_migration` con este archivo (o `supabase db push`).
--   2. `get_advisors` (security + performance) — se espera CERO hallazgos
--      nuevos: sólo se agregan 2 índices, no se toca ninguna policy, grant,
--      tabla ni función.
--   3. NO hace falta regenerar `lib/database.types.ts`: un índice no cambia la
--      forma de la tabla.
-- =============================================================================
--
-- La pantalla de auditoría (app/admin/auditoria/) ordena SIEMPRE por
-- `created_at desc, id desc` y pagina por keyset (cursor), nunca por offset.
-- Filtra opcionalmente por `actor_id` y por rango de `created_at`. Hoy
-- `admin_audit_log` sólo tiene el índice de la PK — cualquiera de esas
-- consultas es un seq scan + sort.
--
-- `id` va en la clave del índice como desempate estable del keyset: dos filas
-- con el mismo `created_at` (mismo timestamp al microsegundo) tienen que
-- ordenarse de forma determinística para que el cursor no saltee ni repita
-- filas entre páginas.
--
-- NO se toca `admin_audit_log_select_admin` ni ningún grant: el panel lee esta
-- tabla por service role (bypassa RLS); la policy protege el otro camino (un
-- usuario `authenticated` pegándole directo con su token) y queda igual.

-- `if not exists` para re-ejecución idempotente. Sin `concurrently`: Supabase
-- `apply_migration` corre en transacción (donde `concurrently` no está
-- permitido) y `admin_audit_log` hoy está esencialmente vacía — el lock de
-- escritura al crear el índice es despreciable. Mismo estilo que
-- `pagos_user_id_idx` / `pagos_proveedor_ref_idx` en la migración inicial.

-- Orden global del ledger de auditoría (sin filtro de actor).
create index if not exists admin_audit_log_created_at_idx
  on public.admin_audit_log (created_at desc, id desc);

-- Filtro por actor + el mismo orden/keyset.
create index if not exists admin_audit_log_actor_created_idx
  on public.admin_audit_log (actor_id, created_at desc, id desc);
