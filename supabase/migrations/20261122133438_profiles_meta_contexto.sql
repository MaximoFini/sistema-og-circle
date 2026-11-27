-- profiles.meta_contexto: contexto de atribución/marketing del registro (jsonb).
--
-- Esta migración se aplicó directo en la base y no estaba en el repo (drift);
-- se reconstruye acá a partir del estado real de producción para que un
-- proyecto nuevo quede igual. Es idempotente: en producción no cambia nada.
--
-- Sólo la lee el servidor (service_role): `authenticated` NO tiene SELECT ni
-- UPDATE sobre esta columna. Por eso las consultas de cliente sobre `profiles`
-- tienen que listar columnas explícitas (un `select *` da 42501).

alter table public.profiles
  add column if not exists meta_contexto jsonb;

revoke all (meta_contexto) on public.profiles from anon, authenticated;
