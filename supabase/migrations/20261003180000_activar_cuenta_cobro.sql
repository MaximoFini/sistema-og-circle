-- =============================================================================
-- VGRP-62 / Bloque 13 — activar_cuenta_cobro(p_id)
-- =============================================================================
-- Deja ACTIVA exactamente una cuenta de cobro: desactiva la que estuviera
-- activa y activa la elegida, en una sola transacción. La tabla ya existe
-- (VGRP-68); esto sólo agrega la función.
--
-- Por qué una función y no dos UPDATE desde TypeScript: entre el primero y el
-- segundo habría un instante con cero cuentas activas (los usuarios verían
-- "pago no disponible"), y si el segundo falla queda así de forma permanente.
--
-- Concurrencia: el advisory lock serializa dos activaciones simultáneas (dos
-- admins a la vez). Sin él, cada transacción desactivaría "la otra" y activaría
-- la suya, y el índice único parcial `cuentas_cobro_una_activa_idx` haría fallar
-- a una con 23505. Con el lock, la segunda espera y gana la última.
--
-- Devuelve jsonb { anterior, nuevo }: la fila que estaba activa (o null) y la
-- fila ya activada, leídas dentro de la misma transacción, para que el audit
-- log registre valor anterior y nuevo sin una carrera de lectura en TypeScript.
--
-- Sin `security definer`: sólo la llama service_role (BYPASSRLS), no necesita
-- privilegios de otro dueño. `search_path = ''` + nombres con esquema por la
-- misma razón que en las demás funciones del repo.

create or replace function public.activar_cuenta_cobro(p_id uuid)
returns jsonb
language plpgsql
set search_path = ''
as $$
declare
  v_anterior public.cuentas_cobro;
  v_nuevo public.cuentas_cobro;
begin
  perform pg_advisory_xact_lock(hashtext('activar_cuenta_cobro'));

  select * into v_nuevo from public.cuentas_cobro where id = p_id for update;
  if not found then
    -- P0002 = no_data_found: la ruta lo traduce a 404.
    raise exception 'cuenta_no_encontrada' using errcode = 'P0002';
  end if;

  select * into v_anterior from public.cuentas_cobro where activa and id <> p_id;

  update public.cuentas_cobro
    set activa = false, updated_at = now()
    where activa and id <> p_id;

  update public.cuentas_cobro
    set activa = true, updated_at = now()
    where id = p_id
    returning * into v_nuevo;

  return jsonb_build_object(
    'anterior', case when v_anterior.id is null then null else to_jsonb(v_anterior) end,
    'nuevo', to_jsonb(v_nuevo)
  );
end;
$$;

comment on function public.activar_cuenta_cobro(uuid) is
  'Deja activa exactamente una cuenta de cobro (VGRP-62). Atómica y serializada '
  'por advisory lock. Sólo service_role. Devuelve { anterior, nuevo } en jsonb.';

-- Por default Postgres da EXECUTE a PUBLIC (y Supabase a anon/authenticated):
-- se revoca todo y se concede sólo a service_role, igual que
-- 20260822043002_revoke_public_execute_internal_functions.sql.
revoke execute on function public.activar_cuenta_cobro(uuid) from public, anon, authenticated;
grant execute on function public.activar_cuenta_cobro(uuid) to service_role;
