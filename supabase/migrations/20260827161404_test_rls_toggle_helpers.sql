-- =============================================================================
-- VGRP-44 — RPC para desactivar/reactivar UNA policy de RLS puntual desde los
-- tests de integración (criterio "Verificación de que los tests sirven":
-- desactivar una policy y confirmar que el test correspondiente falla).
-- =============================================================================
-- Aplicada al proyecto real (og-circle, hsmodrhbwkromoixrxrt) vía Supabase
-- MCP el 2026-08-27. Este archivo la deja trackeada en el repo para que
-- `supabase db reset` / `db push` la reproduzcan igual en cualquier otro
-- entorno.
--
-- Por qué no alcanza con `ALTER TABLE ... DISABLE ROW LEVEL SECURITY`: eso
-- apaga TODAS las policies de la tabla a la vez. Postgres tampoco tiene un
-- "ALTER POLICY ... DISABLE" para una policy puntual — la única forma de
-- desactivar UNA sola sin tocar las demás es borrarla y, después, recrearla
-- idéntica. Por eso son tres funciones y no una: primero hay que leer la
-- definición completa (test_get_policy_definition) para poder reconstruirla,
-- recién después borrarla (test_drop_policy), y al final recrearla
-- (test_create_policy) con exactamente los mismos datos.
--
-- SECURITY DEFINER + restringidas a service_role: son las únicas dos formas
-- de que esto funcione, porque PostgREST (lo que usa supabase-js por debajo)
-- no expone ejecución de SQL arbitrario, sólo RPC a funciones ya definidas.
-- Sin SECURITY DEFINER, ni siquiera service_role podría ejecutar el DDL de
-- adentro (DROP POLICY / CREATE POLICY) a través de una llamada RPC normal.
--
-- Riesgo real y por qué se acepta: estas funciones pueden borrar y recrear la
-- policy de CUALQUIER tabla del schema public, no sólo las de test. Quien
-- tiene la service role key YA tiene acceso completo a toda la base (bypasea
-- RLS por completo), así que esto no es una escalación de privilegios nueva
-- sobre esa key — es simplemente la primera vez que se le da a esa key la
-- posibilidad de ejecutar DDL puntual (antes sólo podía hacer CRUD vía REST).
-- El chequeo de `p_schema = 'public'` de abajo es el límite explícito: ni con
-- la service role key esto puede tocar el schema `auth` (las policies
-- internas de Supabase Auth) por accidente o por un typo en un test.
--
-- Repetir la decisión de VGRP-43: cuando exista un proyecto de producción
-- separado del de test, revisar si esta migración debe excluirse de ese
-- proyecto (no hay ninguna razón para que producción tenga estas funciones).

create or replace function public.test_get_policy_definition(
  p_schema text,
  p_table text,
  p_policy text
)
returns table (
  permissive text,
  roles name[],
  cmd text,
  qual text,
  with_check text
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_schema <> 'public' then
    raise exception 'test_get_policy_definition solo opera sobre el schema "public" (pidieron "%")', p_schema;
  end if;

  return query
  select pol.permissive, pol.roles, pol.cmd, pol.qual, pol.with_check
  from pg_catalog.pg_policies pol
  where pol.schemaname = p_schema
    and pol.tablename = p_table
    and pol.policyname = p_policy;
end;
$$;

comment on function public.test_get_policy_definition(text, text, text) is
  'VGRP-44 — lee la definición completa de una policy de pg_policies, para '
  'que test_drop_policy + test_create_policy puedan borrarla y recrearla '
  'idéntica. Restringida a service_role, sólo schema public — ver comentario '
  'al inicio de la migración que la creó.';

create or replace function public.test_drop_policy(
  p_schema text,
  p_table text,
  p_policy text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if p_schema <> 'public' then
    raise exception 'test_drop_policy solo opera sobre el schema "public" (pidieron "%")', p_schema;
  end if;

  execute format('drop policy %I on %I.%I', p_policy, p_schema, p_table);
end;
$$;

comment on function public.test_drop_policy(text, text, text) is
  'VGRP-44 — borra una policy puntual. SIEMPRE usar test_get_policy_definition '
  'antes para poder recrearla después con test_create_policy: dejar una '
  'policy borrada sin recrear en el proyecto real es un incidente de '
  'seguridad, no un detalle de test.';

create or replace function public.test_create_policy(
  p_schema text,
  p_table text,
  p_policy text,
  p_permissive text,
  p_roles name[],
  p_cmd text,
  p_qual text,
  p_with_check text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_roles text;
  v_sql text;
begin
  if p_schema <> 'public' then
    raise exception 'test_create_policy solo opera sobre el schema "public" (pidieron "%")', p_schema;
  end if;

  select string_agg(quote_ident(r), ', ') into v_roles from unnest(p_roles) as r;
  if v_roles is null then
    raise exception 'test_create_policy: p_roles vino vacío, no se puede recrear la policy "%"', p_policy;
  end if;

  -- %s (no %I/%L) para p_permissive y p_cmd a propósito: son palabras clave
  -- de la sentencia (PERMISSIVE/RESTRICTIVE, SELECT/INSERT/UPDATE/DELETE/ALL),
  -- no identificadores ni literales — pg_policies ya las devuelve como el
  -- texto exacto que espera CREATE POLICY.
  v_sql := format(
    'create policy %I on %I.%I as %s for %s to %s',
    p_policy, p_schema, p_table, p_permissive, p_cmd, v_roles
  );
  -- %s (no %L) para p_qual/p_with_check, por el mismo motivo que arriba:
  -- son expresiones SQL booleanas ("id = auth.uid()"), no strings. %L las
  -- envolvería en comillas y produciría una sentencia rota (USING ('id =
  -- auth.uid()') no es una expresión boolean válida, es un literal de texto).
  -- No hay forma de "escapar" una expresión SQL arbitraria sin parsearla —
  -- por eso el límite real de esta función no es el formateo, es el chequeo
  -- de rol de arriba (sólo service_role, ver comentario al inicio del
  -- archivo): quien puede llegar hasta acá ya tiene acceso completo a la
  -- base por otras vías, así que no hay una superficie de inyección nueva
  -- que este %s esté abriendo.
  if p_qual is not null then
    v_sql := v_sql || format(' using (%s)', p_qual);
  end if;
  if p_with_check is not null then
    v_sql := v_sql || format(' with check (%s)', p_with_check);
  end if;

  execute v_sql;
end;
$$;

comment on function public.test_create_policy(text, text, text, text, name[], text, text, text) is
  'VGRP-44 — recrea una policy con la definición exacta que devolvió '
  'test_get_policy_definition. Si esta llamada falla después de un '
  'test_drop_policy, la policy queda sin recrear: recrearla A MANO de '
  'inmediato con esos mismos valores.';

revoke all on function public.test_get_policy_definition(text, text, text) from public, anon, authenticated;
revoke all on function public.test_drop_policy(text, text, text) from public, anon, authenticated;
revoke all on function public.test_create_policy(text, text, text, text, name[], text, text, text) from public, anon, authenticated;

grant execute on function public.test_get_policy_definition(text, text, text) to service_role;
grant execute on function public.test_drop_policy(text, text, text) to service_role;
grant execute on function public.test_create_policy(text, text, text, text, name[], text, text, text) to service_role;
