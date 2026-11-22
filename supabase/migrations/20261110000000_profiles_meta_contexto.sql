-- =============================================================================
-- profiles.meta_contexto — datos del navegador para mandar a Meta (Conversions
-- API) cuando el evento no sale del navegador del usuario (VGRP-95, Bloque 17).
-- =============================================================================
-- Meta exige `client_user_agent` (y recomienda IP, fbp y fbc) en cada evento
-- de servidor. El registro y el inicio de checkout pasan por el navegador, pero
-- el webhook de Mercado Pago no: lo llama el servidor de MP, sin user agent
-- del comprador. Por eso se guarda acá al registrarse / iniciar el checkout, y
-- el webhook lo lee al confirmar el pago (`Purchase`).
--
-- Forma esperada (la escribe el servidor, no se valida acá): jsonb con
-- `user_agent`, `ip`, `fbp`, `fbc`. Null = todavía no se capturó.
--
-- SÓLO service_role. profiles tiene `grant select ... to authenticated` a
-- nivel TABLA (init_plataforma.sql, sección 6), así que una columna nueva
-- quedaría legible por el propio usuario (la policy de RLS filtra filas, no
-- columnas). Contiene IP y user agent: no tiene por qué volver al navegador.
-- Se cierra pasando `authenticated` de select de tabla a select POR COLUMNA,
-- con todas las columnas actuales menos `meta_contexto`. Revisado antes de
-- hacerlo: todo el código con sesión de usuario lee profiles con columnas
-- explícitas (telefono; nombre, email, telefono, nivel; progreso; nivel) y los
-- `select("*")` sobre profiles usan el cliente service_role, que no se ve
-- afectado. Sin grant de update a `authenticated` (no se escribe desde el
-- usuario).
--
-- Costo a tener en cuenta: de acá en más, un `select()` / `select("*")` sobre
-- profiles con sesión de usuario falla con "permission denied" (también en los
-- tests de integración: rls.test.ts y video-actions.test.ts pedían `select()` y
-- pasaron a `select("id")`), y toda columna nueva de profiles que el usuario
-- deba leer necesita su propio `grant select (col)`. Es el mismo
-- criterio fail-closed que ya se usa para nivel/rol.
--
-- `supabase_auth_admin` conserva su `grant select` de tabla (auth_hook.sql):
-- es el rol interno del hook de claims, no lo usa ningún usuario.
-- =============================================================================

alter table public.profiles
  add column meta_contexto jsonb;

comment on column public.profiles.meta_contexto is
  'Datos del navegador (user_agent, ip, fbp, fbc) capturados al registrarse o '
  'iniciar el checkout, para el evento Purchase de Meta CAPI desde el webhook '
  'de Mercado Pago. Lo escribe y lo lee sólo service_role; authenticated no '
  'tiene select sobre esta columna. Null = sin capturar.';

revoke select on public.profiles from authenticated;

grant select (
  id,
  email,
  nombre,
  telefono,
  nivel,
  rol,
  progreso,
  created_at,
  updated_at,
  terminos_aceptados_at,
  terminos_version,
  origen_registro,
  bienvenida_enviada_at,
  es_prueba
) on public.profiles to authenticated;
