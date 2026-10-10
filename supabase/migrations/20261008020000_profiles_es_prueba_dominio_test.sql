-- =============================================================================
-- profiles.es_prueba automático para las cuentas del dominio de test.
-- =============================================================================
-- Los tests (integración y e2e) corren contra la base real y crean cuentas
-- `…@test.og-circle.invalid` (helper de tests, registro por la pantalla real y el
-- seed). Mientras corre un CI esas cuentas existen unos minutos y, como nacían con
-- `es_prueba = false`, aparecían en /admin/usuarios para los administradores.
--
-- `.invalid` es un TLD reservado (RFC 2606): ningún cliente real puede tener ese
-- dominio, así que marcar todo lo que llega con él es seguro. Se hace en la base
-- (BEFORE INSERT) y no en cada helper, para cubrir cualquier camino de alta.
--
-- Sólo marca (nunca desmarca): un `es_prueba = true` explícito se respeta, y una
-- cuenta real con otro dominio queda en false como hasta ahora.
-- =============================================================================

create or replace function public.profiles_marcar_cuenta_de_test()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if new.email ilike '%@test.og-circle.invalid' then
    new.es_prueba := true;
  end if;
  return new;
end;
$$;

comment on function public.profiles_marcar_cuenta_de_test() is
  'BEFORE INSERT en profiles: marca es_prueba = true las cuentas del dominio de '
  'test (@test.og-circle.invalid, TLD reservado). Ver migración '
  '20261008020000_profiles_es_prueba_dominio_test.sql.';

create trigger profiles_marcar_cuenta_de_test_trigger
  before insert on public.profiles
  for each row
  execute function public.profiles_marcar_cuenta_de_test();

-- Mismo criterio que el resto de las funciones internas (20260822043002): no se
-- puede ejecutar por RPC.
revoke execute on function public.profiles_marcar_cuenta_de_test() from public, anon, authenticated;

-- Backfill: las cuentas de test que ya existan.
update public.profiles
  set es_prueba = true
  where email ilike '%@test.og-circle.invalid'
    and es_prueba = false;
