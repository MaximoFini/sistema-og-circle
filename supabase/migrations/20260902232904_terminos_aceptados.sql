-- =============================================================================
-- VGRP-34 — Registro de aceptación de Términos y Condiciones.
-- =============================================================================
-- Misma advertencia que VGRP-15 (20260822035923_init_plataforma.sql): esta
-- máquina no tiene el Supabase CLI vinculado al proyecto, así que este SQL no
-- se pudo ejecutar de verdad acá. Revisado línea por línea contra los
-- criterios de aceptación del ticket. Aplicar con `supabase db push` desde
-- una máquina con el proyecto vinculado.
-- =============================================================================

alter table public.profiles
  add column terminos_aceptados_at timestamptz,
  add column terminos_version text;

comment on column public.profiles.terminos_aceptados_at is
  'Fecha en la que el usuario aceptó los Términos y la Política de '
  'Privacidad vigentes al momento del registro. Se escribe una única vez, '
  'desde `registrarse()` en app/(auth)/_actions.ts (VGRP-34), junto con '
  'terminos_version. No hay guard trigger como el de nivel/rol '
  '(profiles_guard_nivel_rol): es un dato de auditoría legal que el propio '
  'usuario tiene que poder escribir, no una columna de control de acceso.';

comment on column public.profiles.terminos_version is
  'Identificador de la versión del texto legal aceptada (ver '
  'lib/legal/version.ts, TERMINOS_VERSION). Permite saber, si el texto '
  'cambia, quién aceptó qué versión.';

-- Mismo criterio de grants por columna que nombre/telefono/progreso
-- (init_plataforma.sql, sección 6): columnas no sensibles, el usuario
-- autenticado puede escribir su propia fila (RLS ya limita a la propia),
-- sin pasar por service_role.
grant update (terminos_aceptados_at, terminos_version) on public.profiles to authenticated;
