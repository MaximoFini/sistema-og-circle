-- =============================================================================
-- profiles.es_prueba — marca las cuentas de prueba para ocultarlas del listado
-- de usuarios del admin (/admin/usuarios) sin borrarlas de la base.
-- =============================================================================
-- Sin grant de update a `authenticated`, a propósito: la escribe sólo quien
-- tenga service_role (o SQL directo). El usuario no puede marcarse ni
-- desmarcarse a mano. profiles conserva sólo los grants por columna de
-- init_plataforma.sql (sección 6) y terminos_aceptados.
--
-- Default false: toda cuenta nueva (un cliente real que se registra) es real.
-- Una cuenta de prueba se marca a mano:
--   update public.profiles set es_prueba = true where email = '...';
--
-- Backfill (08/10/2026): hasta hoy todas las cuentas existentes eran de prueba
-- salvo las de los dos administradores reales, que se dejan sin marcar.
-- =============================================================================

alter table public.profiles
  add column es_prueba boolean not null default false;

comment on column public.profiles.es_prueba is
  'true = cuenta de prueba: no aparece por defecto en /admin/usuarios (filtro '
  '"Cuentas de prueba"). No se borra ni cambia nada más de la cuenta. Lo '
  'escribe sólo service_role / SQL directo; default false.';

update public.profiles
  set es_prueba = true
  where email not in ('emilianoverabusiness@gmail.com', 'joaquinverabusiness@gmail.com');
