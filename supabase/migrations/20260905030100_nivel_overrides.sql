-- =============================================================================
-- VGRP-36 / Bloque 5 — Tabla `nivel_overrides` + `nivel_vigente()` v3
-- =============================================================================
-- Escrita a mano siguiendo el mismo criterio que las migraciones previas de
-- este repo (20260822035923_init_plataforma.sql, 20260905023031_nivel_vigente_
-- precedencia.sql, 20260905030000_admin_audit_log_indices.sql). Revisada línea
-- por línea contra design.md §"VGRP-36 — `nivel_overrides` + `nivel_vigente()`
-- v3".
--
-- APLICADA el 2026-09-05 con `apply_migration` (MCP de Supabase) en el proyecto
-- real (og-circle, ref hsmodrhbwkromoixrxrt, región sa-east-1 — ver
-- docs/SUPABASE-SETUP.md). `lib/database.types.ts` se regeneró después con
-- `generate_typescript_types` (suma `nivel_overrides` Row/Insert/Update).
-- `get_advisors` (security + performance) corrido después — ver el cuerpo de la
-- PR de VGRP-36.
-- =============================================================================
--
-- POR QUÉ ESTA TABLA (design.md §Overview): US-4 pide poder fijar CUALQUIER
-- nivel del enum a mano (incluido bajar a `ninguno`) sin que exista un pago de
-- Mercado Pago asociado — algo que no se puede hacer insertando una fila
-- sintética en `pagos` (`nivel_vigente` toma el MÁXIMO del ledger, así que una
-- fila sintética no permite BAJAR el nivel). `nivel_overrides` es un ledger
-- append-only paralelo que `nivel_vigente()` v3 pasa a considerar; el webhook
-- de Mercado Pago no cambia y sigue llamando a la misma función.
--
-- APPEND-ONLY: una fila por acción de activación manual. Nunca se hace UPDATE
-- ni DELETE (mismo criterio que `pagos`). "Gana" la fila más reciente por
-- usuario. Es además un registro de auditoría en sí mismo, redundante con
-- `admin_audit_log` a propósito: vive en el dominio de negocio y sobrevive
-- aunque se borre el actor.

create table public.nivel_overrides (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles (id),
  nivel public.nivel_acceso not null,
  motivo text not null,
  actor_id uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index nivel_overrides_user_created_idx
  on public.nivel_overrides (user_id, created_at desc);

comment on table public.nivel_overrides is
  'Activaciones/cambios manuales de nivel desde el panel de admin (VGRP-36). '
  'Append-only. nivel_vigente() considera la fila más reciente por usuario y la '
  'aplica si es posterior al pago approved no reembolsado de mayor nivel — así '
  'un pago real posterior de ese nivel siempre supera un override viejo.';

-- RLS default-deny: sin policies para `authenticated` -> RLS deniega TODO por
-- defecto (igual que `pagos` para insert/update). Sólo `service_role`
-- (BYPASSRLS) escribe y lee — el panel consulta por service role; la barrera
-- de autorización es el check de rol de la capa de ruta (design.md
-- §"Sanitización de acceso admin en la capa de datos").
alter table public.nivel_overrides enable row level security;
revoke all on public.nivel_overrides from anon, authenticated;
grant all on public.nivel_overrides to service_role;

-- ---------------------------------------------------------------------------
-- nivel_vigente() v3 — ahora considera `nivel_overrides`.
-- ---------------------------------------------------------------------------
-- GARANTÍA (design.md §"Open questions / risks" #1, 36-T3): con CERO filas en
-- `nivel_overrides` el resultado es IDÉNTICO al de la v2
-- (20260905023031_nivel_vigente_precedencia.sql). El CTE `ledger` reproduce la
-- lógica v2 (nivel más alto entre pagos approved sin refunded posterior); si no
-- hay override, el `coalesce` cae a `(select l.nivel from ledger l)`, que es
-- exactamente `order by nivel_comprado desc limit 1`.
--
-- SEMÁNTICA DEL `at` (opción B, decidida por el coordinador — cierra el hueco #1
-- del CTE `ledger`): el `ledger` selecciona UNA sola fila — el pago approved
-- (sin refunded posterior) de MAYOR nivel; ante empate de nivel, el más
-- reciente — y `ledger.at` es el `created_at` DE ESE pago, no un `max()` global.
-- Antes (v3 previa) `ledger.at` era `max(p.created_at)` sobre todos los pagos
-- relevantes, así que el `at` contra el que se comparaba el override podía venir
-- de un pago de OTRO nivel (p. ej. un pago chico posterior) y "tapar"
-- indebidamente un override legítimo. Ahora el override se compara SIEMPRE
-- contra el pago que aporta el nivel que habría ganado.
--
-- El override "gana" sólo si su `created_at` es >= al `created_at` de ese pago
-- de mayor nivel (o si no hay ningún pago relevante — `coalesce(..., '-infinity')`).
-- Consecuencia deseada: si un admin baja a alguien a `ninguno` y esa persona
-- después paga por MP, el pago (más nuevo) restaura el acceso automáticamente en
-- la siguiente re-proyección del webhook.
--
-- La comparación asume que `pagos.created_at` es la hora de INSERCIÓN de la
-- fila (`default now()`, init_plataforma.sql) — el webhook `insertarPago` no
-- setea `created_at`, así que refleja cuándo se procesó la notificación, no el
-- `date_created` de Mercado Pago. Un override sólo puede "tapar" un pago
-- procesado ANTES que él.
--
-- La comparación de niveles se apoya en el orden de declaración del enum
-- (`avanzado` > `principiante` > `ninguno`) — ver el comentario extenso de la
-- migración v2.
create or replace function public.nivel_vigente(p_user_id uuid)
returns public.nivel_acceso
language sql
stable
set search_path = ''
as $$
  with ledger as (
    -- El pago approved (sin refunded posterior) de MAYOR nivel; ante empate de
    -- nivel, el más reciente. `at` = su created_at (no un max() global).
    select p.nivel_comprado as nivel, p.created_at as at
    from public.pagos p
    where p.user_id = p_user_id
      and p.estado = 'approved'
      and not exists (
        select 1 from public.pagos r
        where r.proveedor_ref = p.proveedor_ref and r.estado = 'refunded'
      )
    order by p.nivel_comprado desc, p.created_at desc
    limit 1
  ),
  ovr as (
    select nivel, created_at as at
    from public.nivel_overrides
    where user_id = p_user_id
    order by created_at desc
    limit 1
  )
  select coalesce(
    -- El override más reciente gana si su created_at es >= al del pago de mayor
    -- nivel (o si no hay ningún pago relevante).
    (select o.nivel from ovr o
     where o.at >= coalesce((select l.at from ledger l), '-infinity'::timestamptz)),
    (select l.nivel from ledger l),   -- lógica v2: nivel más alto del ledger
    'ninguno'::public.nivel_acceso
  );
$$;

comment on function public.nivel_vigente(uuid) is
  'Deriva el nivel de acceso vigente de un usuario. v3 (VGRP-36): considera '
  'public.nivel_overrides (activación manual del panel de admin) además del '
  'ledger de pagos. El override más reciente por usuario gana si su created_at '
  'es >= al created_at del pago approved (sin refunded posterior) de MAYOR '
  'nivel — no de un max(created_at) global (opción B). Si no hay override, cae '
  'a la lógica v2 (nivel MÁS ALTO del ledger, nunca el más reciente). Válido '
  'porque nivel_acceso está declarado en orden de precedencia. Con cero '
  'overrides el resultado es idéntico a la v2.';

-- ---------------------------------------------------------------------------
-- Índice para el listado de usuarios del panel (order by created_at desc + id
-- desc, keyset). Sin índice trigram para `email ilike '%q%'`: a la escala de
-- STACK.md (cientos a pocos miles de usuarios) el seq scan es irrelevante y
-- pg_trgm es una extensión más para mantener. Revisar si `profiles` supera
-- ~50k filas.
create index profiles_created_at_idx on public.profiles (created_at desc, id desc);
