-- Backfill del repo: esta migración ya estaba aplicada contra el proyecto
-- real (versión 20260822044809) pero no existía como archivo local —
-- reconstruida a partir de
-- `supabase_migrations.schema_migrations.statements` para que el historial
-- del repo coincida con el del proyecto.

comment on table public.leads is
  'Tabla de leads (Fase 1/2). Resuelto 2026-08-22: la landing no capturaba leads todavía al aplicar esta migración, así que no había datos reales con los que reconciliar — esta tabla es la fuente de verdad de acá en adelante.';
