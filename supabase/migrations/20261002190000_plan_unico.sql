-- =============================================================================
-- VGRP-59 / Bloque 13 — Plan único: de ('ninguno','principiante','avanzado')
-- a ('ninguno','completo').
-- =============================================================================
-- Decisión del equipo (02/10/2026): Principiante y Avanzado se unifican en un
-- solo plan, con TODAS las capacidades del actual Avanzado. El nombre
-- comercial ("Plan X") es copy, vive en Edge Config (VGRP-60) — el valor
-- interno es neutro y estable a propósito: `completo`.
--
-- Va en el mismo PR que el código de VGRP-60 (lib/auth/claims.ts, etc.): si
-- esta migración se aplica sin ese código, `getNivel()` no reconoce `completo`
-- y deja a todo el mundo sin acceso hasta el próximo deploy.
--
-- Aplicada el 2026-10-02 con `apply_migration` (MCP de Supabase) al proyecto
-- real (og-circle, hsmodrhbwkromoixrxrt, sa-east-1). Verificado antes de
-- aplicar: profiles=4, pagos=3 (proveedor='seed'), leads=0 — datos de seed,
-- no de clientes reales.
--
-- LEDGER APPEND-ONLY: reescribir `pagos.nivel_comprado` de filas viejas es un
-- cambio de ESQUEMA, no una edición de negocio — con un solo plan,
-- "principiante" y "avanzado" pasan a significar lo mismo. El dato original
-- de qué nivel se compró en su momento queda intacto en `payload_raw`
-- (columna que esta migración no toca).
--
-- TRANSICIÓN DE TOKENS: no hace falta un script one-off que reescriba
-- `app_metadata` en `auth.users`. El Custom Access Token Hook
-- (`custom_access_token_hook`, ver 20260822035925_auth_hook.sql) relee
-- `profiles.nivel` en CADA emisión de token (login y refresh, ~1h) y
-- sobreescribe el claim — apenas esta migración corre, el próximo token de
-- cada usuario ya trae `completo`. El código de VGRP-60 sólo necesita mapear
-- los tokens VIEJOS (ya emitidos, hasta que venzan) que todavía dicen
-- 'principiante'/'avanzado'.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. Enum nuevo, bajo el nombre viejo libre temporalmente.
-- -----------------------------------------------------------------------------
-- Patrón estándar para "achicar" un enum (Postgres no soporta DROP VALUE):
-- renombrar el tipo viejo, crear el nuevo con el nombre real, migrar todo lo
-- que lo usa, y recién al final borrar el viejo.

alter type public.nivel_acceso rename to nivel_acceso_v_principiante_avanzado;

create type public.nivel_acceso as enum ('ninguno', 'completo');

comment on type public.nivel_acceso is
  'VGRP-59 — dos valores: ninguno | completo. Reemplaza al enum de tres '
  'valores (ninguno/principiante/avanzado) del modelo de dos niveles '
  '(pre-Bloque 13). "completo" es el identificador interno del único plan; '
  'el nombre comercial ("Plan X" por ahora) vive en Edge Config '
  '(lib/config/schema.ts, precios.plan / plan.nombre) y se cambia sin tocar '
  'este enum.';

-- -----------------------------------------------------------------------------
-- 2. Dropear lo que depende del tipo viejo, en orden de dependencia.
-- -----------------------------------------------------------------------------

-- 2a. Vista: sus columnas de salida (nivel_comprado, user_nivel_actual) están
-- tipadas por las columnas de pagos/profiles, que todavía son del tipo viejo.
drop view public.admin_pagos_ledger;

-- 2b. Policies de contenido por nivel: referencian `nivel_requerido` (columna
-- que esta migración DROPEA en el paso 5 — con un solo plan, deja de tener
-- sentido distinguir nivel_requerido por fila).
drop policy "agentes_select_por_nivel" on public.agentes;
drop policy "videos_select_por_nivel" on public.videos;
drop policy "servicios_financieros_select_por_nivel" on public.servicios_financieros;

-- 2c. nivel_vigente(): su tipo de RETORNO es el enum viejo — no se puede
-- "replace" cambiando el tipo de retorno, hay que dropear y recrear (paso 6).
drop function public.nivel_vigente(uuid);

-- 2d. custom_access_token_hook: declara `v_nivel public.nivel_acceso` interno.
-- El cuerpo no cambia (no hay ningún literal 'principiante'/'avanzado'/
-- 'completo' adentro, sólo lee la columna y arma el jsonb), pero hay que
-- recrearlo DESPUÉS de que el nombre `nivel_acceso` vuelva a apuntar al tipo
-- nuevo (paso 1 ya lo hizo) para que a la hora de recompilar su dependencia
-- quede sobre el tipo nuevo y no sobre el viejo. `create or replace` con el
-- mismo texto alcanza — no es necesario tocar ninguna lógica.
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
      perfil := null;
  end;

  if perfil is null then
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
  'Custom Access Token Hook de Supabase Auth (VGRP-16). Sin cambios de '
  'lógica en VGRP-59 — recreada sólo para rebindear la dependencia del tipo '
  '`nivel_acceso` al enum nuevo (ninguno/completo) antes de dropear el viejo. '
  'Fail-open a los defaults si la fila de profiles todavía no existe o algo '
  'inesperado falla al leerla.';

-- -----------------------------------------------------------------------------
-- 3. Retipar las columnas que usan el enum, mapeando los 3 valores viejos a
--    los 2 nuevos: 'principiante'/'avanzado' -> 'completo', 'ninguno' -> 'ninguno'.
-- -----------------------------------------------------------------------------

alter table public.profiles alter column nivel drop default;
alter table public.profiles
  alter column nivel type public.nivel_acceso
  using (
    case when nivel::text in ('principiante', 'avanzado') then 'completo' else 'ninguno' end
  )::public.nivel_acceso;
alter table public.profiles alter column nivel set default 'ninguno'::public.nivel_acceso;

alter table public.pagos
  alter column nivel_comprado type public.nivel_acceso
  using (
    case when nivel_comprado::text in ('principiante', 'avanzado') then 'completo' else 'ninguno' end
  )::public.nivel_acceso;

alter table public.nivel_overrides
  alter column nivel type public.nivel_acceso
  using (
    case when nivel::text in ('principiante', 'avanzado') then 'completo' else 'ninguno' end
  )::public.nivel_acceso;

-- leads.nivel_interes es nullable (campo informativo del formulario de lead de
-- la Fase 1, hoy sin filas) — el `case` preserva NULL si no matchea ninguna rama.
alter table public.leads
  alter column nivel_interes type public.nivel_acceso
  using (
    case
      when nivel_interes::text in ('principiante', 'avanzado') then 'completo'
      when nivel_interes::text = 'ninguno' then 'ninguno'
      else null
    end
  )::public.nivel_acceso;

-- -----------------------------------------------------------------------------
-- 4. Hardening pedido por el comentario de admin_pagos_ledger (VGRP-37):
--    el anti-join de refunds correlaciona HOY sólo por proveedor_ref. A partir
--    del Bloque 13 hay un segundo proveedor ('transferencia', VGRP-63) — sumar
--    `and r.proveedor = p.proveedor` en nivel_vigente() y en la vista evita que
--    un proveedor_ref que por azar coincida entre proveedores distintos anule
--    un pago que no debería.
-- -----------------------------------------------------------------------------

-- 5. Contenido: con un solo plan, nivel_requerido deja de tener sentido en
--    agentes/videos/servicios_financieros. Se dropea la columna (las policies
--    que la usaban ya se dropearon en el paso 2b).
-- -----------------------------------------------------------------------------

alter table public.agentes drop column nivel_requerido;
alter table public.videos drop column nivel_requerido;
alter table public.servicios_financieros drop column nivel_requerido;

-- -----------------------------------------------------------------------------
-- 6. Enum viejo: ya no debería tener dependientes. Si esto falla, hay un
--    objeto que esta migración no contempló — no forzar con CASCADE.
-- -----------------------------------------------------------------------------

drop type public.nivel_acceso_v_principiante_avanzado;

-- -----------------------------------------------------------------------------
-- 7. nivel_vigente() v5 — misma lógica v4 (ver 20261002001931_nivel_vigente_
--    override_resetea.sql: el override más reciente es un RESET, no compite
--    por antigüedad), sólo que sobre el dominio ninguno/completo y con el
--    anti-join de refunds correlacionado también por proveedor.
-- -----------------------------------------------------------------------------

create or replace function public.nivel_vigente(p_user_id uuid)
returns public.nivel_acceso
language sql
stable
set search_path = ''
as $$
  with ultimo_override as (
    select nivel, created_at as at
    from public.nivel_overrides
    where user_id = p_user_id
    order by created_at desc
    limit 1
  ),
  pagos_relevantes as (
    select p.nivel_comprado as nivel
    from public.pagos p
    where p.user_id = p_user_id
      and p.estado = 'approved'
      and p.created_at >= coalesce(
        (select o.at from ultimo_override o),
        '-infinity'::timestamptz
      )
      and not exists (
        select 1
        from public.pagos r
        where r.proveedor_ref = p.proveedor_ref
          and r.proveedor = p.proveedor
          and r.estado = 'refunded'
      )
  )
  select greatest(
    coalesce((select o.nivel from ultimo_override o), 'ninguno'::public.nivel_acceso),
    coalesce((select max(nivel) from pagos_relevantes), 'ninguno'::public.nivel_acceso)
  );
$$;

comment on function public.nivel_vigente(uuid) is
  'v5 (VGRP-59) — mismo algoritmo que v4 (20261002001931_nivel_vigente_'
  'override_resetea.sql: el override más reciente resetea el historial '
  'anterior a su propio instante), sobre el dominio ninguno/completo. Suma '
  '`and r.proveedor = p.proveedor` al anti-join de refunds (antes sólo '
  'proveedor_ref): a partir del Bloque 13 hay un segundo proveedor '
  '(transferencia, VGRP-63) y proveedor_ref por sí solo ya no identifica una '
  'única fila entre proveedores distintos.';

grant execute on function public.nivel_vigente(uuid) to authenticated, service_role;

-- -----------------------------------------------------------------------------
-- 8. admin_pagos_ledger — misma forma y grants que VGRP-37
--    (20260905030200_admin_pagos_ledger.sql), con el mismo hardening de
--    proveedor en el anti-join de refunds y en la exclusión por override.
-- -----------------------------------------------------------------------------

create view public.admin_pagos_ledger
with (security_invoker = true)
as
select
  p.id,
  p.user_id,
  p.proveedor,
  p.proveedor_ref,
  p.nivel_comprado,
  p.monto_ars,
  p.estado,
  p.created_at,
  pr.email as user_email,
  pr.nivel as user_nivel_actual,
  (
    p.estado = 'approved'
    and not exists (
      select 1 from public.pagos r
      where r.proveedor_ref = p.proveedor_ref
        and r.proveedor = p.proveedor
        and r.estado = 'refunded'
    )
    and p.nivel_comprado > pr.nivel
    and not exists (
      select 1 from public.nivel_overrides o
      where o.user_id = p.user_id and o.created_at >= p.created_at
    )
  ) as sin_aplicar
from public.pagos p
join public.profiles pr on pr.id = p.user_id;

comment on view public.admin_pagos_ledger is
  'Ledger de pagos para el panel de admin (VGRP-37; retocada en VGRP-59 sólo '
  'por el cambio de enum y el hardening de proveedor en el anti-join de '
  'refunds). Se consulta SÓLO por service role; security_invoker = true, sin '
  'grants a anon/authenticated.';

revoke all on public.admin_pagos_ledger from anon, authenticated;
grant select on public.admin_pagos_ledger to service_role;

-- -----------------------------------------------------------------------------
-- 9. Policies de contenido simplificadas — un solo plan: activo/publicado Y
--    el claim de nivel es 'completo'. `ninguno` no ve ninguna fila.
-- -----------------------------------------------------------------------------

create policy "agentes_select_con_acceso"
on public.agentes
for select
to authenticated
using (
  activo
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nivel') = 'completo'
);

create policy "videos_select_con_acceso"
on public.videos
for select
to authenticated
using (
  publicado
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nivel') = 'completo'
);

create policy "servicios_financieros_select_con_acceso"
on public.servicios_financieros
for select
to authenticated
using (
  activo
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nivel') = 'completo'
);
