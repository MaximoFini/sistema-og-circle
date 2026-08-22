-- =============================================================================
-- VGRP-16 — Custom Access Token Hook: inyecta nivel/rol en el JWT
-- =============================================================================
-- Igual que las migraciones anteriores de este repo: escrita a mano, sin
-- Supabase CLI instalado ni proyecto vinculado en esta máquina, no fue
-- posible ejecutarla de verdad. Revisada línea por línea contra la firma
-- documentada del Custom Access Token Hook de Supabase Auth.
--
-- Depende de supabase/migrations/20260822035923_init_plataforma.sql (tabla
-- public.profiles, enums nivel_acceso/rol_usuario). Leerla antes de tocar
-- este archivo.
--
-- ⚠️⚠️⚠️ PASO MANUAL QUE NO SE PUEDE HACER DESDE SQL — LEER ANTES DE DAR
-- ESTE TICKET POR TERMINADO ⚠️⚠️⚠️
-- ============================================================================
-- Esta migración deja la FUNCIÓN lista, pero Supabase Auth no la va a llamar
-- hasta que alguien la registre a mano en el dashboard del proyecto:
--
--   1. Authentication → Hooks → "Customize Access Token (Custom Claims)"
--      → activar → seleccionar `public.custom_access_token_hook`.
--   2. Project Settings → JWT Keys → migrar el proyecto a claves de firma
--      ASIMÉTRICAS (ES256). Por defecto Supabase crea proyectos con clave
--      simétrica (HS256); STACK.md §4 exige asimétricas porque son las que
--      permiten verificación LOCAL del JWT (sin roundtrip a Auth) desde
--      `lib/auth/server.ts` (`getClaims()`). Con HS256 la verificación local
--      requeriría compartir el secreto compartido con cada runtime, lo cual
--      no es lo que se quiere.
--
-- Ninguno de los dos pasos es una migración de base de datos: son
-- configuración del proyecto en el dashboard de Supabase. Ver también
-- docs/SUPABASE-SETUP.md, sección "8. Auth Hook y claves asimétricas".
-- ============================================================================

-- -----------------------------------------------------------------------------
-- 1. Función del hook
-- -----------------------------------------------------------------------------
--
-- Contrato del Custom Access Token Hook (Supabase Auth):
--   - Recibe un único argumento jsonb `event` con la forma
--     `{ "user_id": "<uuid>", "claims": { ... claims por defecto ... } }`.
--   - Debe devolver jsonb con la forma `{ "claims": { ... } }`: el objeto
--     `claims` completo que Auth va a firmar y devolver como JWT. No es un
--     merge automático — lo que no esté en el jsonb devuelto, no queda en el
--     token. Por eso se parte siempre de `event -> 'claims'` y se le agrega
--     `app_metadata` encima, en vez de construir un objeto desde cero.
--
-- DECISIÓN — qué pasa si `profiles` todavía no tiene fila para ese user_id:
-- Puede pasar por una carrera real entre el trigger `on_auth_user_created`
-- (que inserta la fila) y el primer login/token emitido para ese usuario —
-- ambos disparados por el mismo INSERT en auth.users, sin garantía de orden.
-- La función NUNCA debe lanzar una excepción en ese caso: un error acá tira
-- abajo el login completo del usuario (Auth aborta la emisión del token si
-- el hook falla). La regla elegida es "fail open a los defaults del sistema,
-- nunca fail closed sobre el login":
--   - Si no hay fila en profiles todavía -> nivel = 'ninguno', rol = 'user'
--     (son exactamente los defaults de columna de la tabla profiles, así que
--     el claim queda igual de conservador que si la fila ya existiera recién
--     creada).
--   - Se preserva el resto de `event -> 'claims'` tal cual llegó (aud, exp,
--     sub, etc.) — sólo se le agrega/sobreescribe la clave `app_metadata`.
--   - Cualquier excepción inesperada (no se espera ninguna, pero por las
--     dudas) también cae en los defaults en vez de propagar: se envuelve la
--     lectura en un bloque `exception` que nunca deja explotar el login.
create or replace function public.custom_access_token_hook(event jsonb)
returns jsonb
language plpgsql
stable
set search_path = ''
as $$
declare
  claims jsonb;
  perfil record;
  v_nivel public.nivel_acceso;
  v_rol public.rol_usuario;
begin
  claims := event -> 'claims';

  begin
    select p.nivel, p.rol
    into perfil
    from public.profiles p
    where p.id = (event ->> 'user_id')::uuid;
  exception
    when others then
      -- No debería pasar nunca (es un select simple por PK), pero un hook
      -- de Auth que explota tira abajo el login: preferimos degradar a los
      -- defaults antes que romper la emisión del token.
      perfil := null;
  end;

  if perfil is null then
    -- Sin fila todavía en profiles (carrera con el trigger de creación, o
    -- cualquier otro caso no esperado): mismos defaults que la columna.
    v_nivel := 'ninguno'::public.nivel_acceso;
    v_rol := 'user'::public.rol_usuario;
  else
    v_nivel := perfil.nivel;
    v_rol := perfil.rol;
  end if;

  claims := jsonb_set(
    claims,
    '{app_metadata}',
    coalesce(claims -> 'app_metadata', '{}'::jsonb)
      || jsonb_build_object('nivel', v_nivel, 'rol', v_rol)
  );

  return jsonb_build_object('claims', claims);
end;
$$;

comment on function public.custom_access_token_hook(jsonb) is
  'Custom Access Token Hook de Supabase Auth (VGRP-16): inyecta '
  'app_metadata.nivel y app_metadata.rol en el JWT leyendo public.profiles. '
  'Fail-open a los defaults (nivel=ninguno, rol=user) si la fila de profiles '
  'todavía no existe o si algo inesperado falla al leerla — nunca debe '
  'lanzar, porque una excepción acá aborta el login del usuario. Registrar '
  'en Authentication → Hooks → Customize Access Token en el dashboard: esto '
  'NO se activa solo por existir la función. Ver comentario grande al '
  'principio de este archivo.';

-- -----------------------------------------------------------------------------
-- 2. Grants — la parte que más se olvida y rompe todo en silencio
-- -----------------------------------------------------------------------------
-- Sin estos grants exactos, el hook falla silenciosamente en producción:
-- Auth ejecuta esta función como el rol `supabase_auth_admin`, no como
-- `authenticated` ni como el owner de la función. Y la función necesita
-- poder leer `profiles`, que por la migración anterior tiene RLS activo y
-- ningún grant a `supabase_auth_admin`.

-- Sólo supabase_auth_admin puede ejecutar el hook. Ningún cliente (ni
-- siquiera un usuario autenticado) debe poder invocarlo directamente: no es
-- una función de negocio, es un callback interno de Auth.
grant execute on function public.custom_access_token_hook(jsonb) to supabase_auth_admin;
revoke execute on function public.custom_access_token_hook(jsonb) from authenticated, anon, public;

-- supabase_auth_admin necesita poder leer profiles para resolver nivel/rol.
-- La función es `stable` (no `security definer`): corre con los privilegios
-- de quien la invoca, así que sin este grant el select de adentro fallaría
-- por RLS/permisos apenas Auth intente emitir el primer token.
grant select on public.profiles to supabase_auth_admin;

-- OJO: el grant de arriba NO alcanza solo. profiles tiene row level security
-- activo (migración anterior) y sus únicas policies son "to authenticated".
-- RLS se evalúa para CUALQUIER rol que no sea el owner de la tabla ni tenga
-- BYPASSRLS, así que sin una policy explícita para supabase_auth_admin el
-- select de la función de arriba corre pero devuelve 0 filas siempre (no
-- error — simplemente filtrado por RLS), y el hook terminaría cayendo
-- siempre en los defaults aunque el usuario sí tenga nivel/rol reales. Este
-- es exactamente el tipo de falla silenciosa que el comentario del ticket
-- pedía evitar con los grants; la policy de acá abajo es la otra mitad
-- necesaria, no un grant.
create policy "profiles_select_auth_admin"
on public.profiles
for select
to supabase_auth_admin
using ( true );
