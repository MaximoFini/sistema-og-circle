-- Hallazgo del advisor de seguridad de Supabase: handle_new_user()
-- (SECURITY DEFINER) y profiles_guard_nivel_rol() son funciones de trigger,
-- no de negocio — no deben quedar ejecutables vía RPC
-- (/rest/v1/rpc/handle_new_user, etc.) por anon/authenticated, que es el
-- default de Postgres para toda función nueva salvo que se revoque
-- explícitamente. Backfill del repo: esta migración ya estaba aplicada
-- contra el proyecto real (versión 20260822043002) pero no existía como
-- archivo local — reconstruida a partir de
-- `supabase_migrations.schema_migrations.statements` para que el historial
-- del repo coincida con el del proyecto.

revoke execute on function public.handle_new_user() from anon, authenticated, public;
revoke execute on function public.profiles_guard_nivel_rol() from anon, authenticated, public;
