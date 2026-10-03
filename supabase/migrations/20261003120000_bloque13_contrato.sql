-- =============================================================================
-- VGRP-68 / Bloque 13 — Contrato compartido del cobro por transferencia (DDL)
-- =============================================================================
-- Sólo las dos tablas. Funciones, policies, grants por columna, bucket de
-- Storage y seed van en los tickets dueños (VGRP-62 y VGRP-63).
--
-- RLS activa y SIN policies (default-deny), igual que `nivel_overrides`: con
-- cero filas y cero policies, nadie con anon key ni con JWT de usuario puede
-- leer ni escribir. Sólo `service_role` (BYPASSRLS).
--
-- ESTADO: escrita pero NO aplicada todavía. Hay que aplicarla en la base de
-- test y en producción (`apply_migration`), regenerar `lib/database.types.ts`
-- y correr `get_advisors`. Se espera sólo el aviso informativo "RLS enabled,
-- no policy", igual que `nivel_overrides`.
-- =============================================================================

-- ---------------------------------------------------------------------------
-- cuentas_cobro — dueño: VGRP-62
-- ---------------------------------------------------------------------------
create table public.cuentas_cobro (
  id uuid primary key default gen_random_uuid(),
  titular text not null,
  cuit text not null,
  banco text not null,
  cbu_cvu text not null,
  alias text not null,
  notas text,
  activa boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- A lo sumo una cuenta activa. `activar_cuenta_cobro()` (VGRP-62) cambia la
-- activa en una transacción; este índice es la red de contención.
create unique index cuentas_cobro_una_activa_idx
  on public.cuentas_cobro (activa) where activa;

comment on table public.cuentas_cobro is
  'Cuentas bancarias a las que transfieren los usuarios (VGRP-62). No se '
  'borran: se desactivan, porque comprobantes_transferencia las referencia. '
  'Sin policies: sólo service_role lee y escribe.';

alter table public.cuentas_cobro enable row level security;
revoke all on public.cuentas_cobro from anon, authenticated;
grant all on public.cuentas_cobro to service_role;

-- ---------------------------------------------------------------------------
-- comprobantes_transferencia — dueño: VGRP-63
-- ---------------------------------------------------------------------------
create table public.comprobantes_transferencia (
  -- Lo genera el servidor: es el `proveedor_ref` de la fila del ledger `pagos`.
  id uuid primary key,
  user_id uuid not null references public.profiles (id),
  cuenta_cobro_id uuid not null references public.cuentas_cobro (id),
  monto_esperado_ars integer not null check (monto_esperado_ars > 0),
  storage_path text not null unique,
  mime_type text not null,
  tamano_bytes integer not null,
  estado text not null default 'pendiente'
    check (estado in ('pendiente', 'aprobado', 'rechazado')),
  motivo_rechazo text,
  resuelto_por uuid references public.profiles (id),
  resuelto_at timestamptz,
  created_at timestamptz not null default now(),
  constraint comprobantes_rechazo_exige_motivo
    check (estado <> 'rechazado' or length(btrim(coalesce(motivo_rechazo, ''))) > 0)
);

-- Un solo comprobante pendiente por usuario.
create unique index comprobantes_un_pendiente_por_usuario_idx
  on public.comprobantes_transferencia (user_id) where estado = 'pendiente';

-- Listado y badge del panel admin (VGRP-65) sin full scan.
create index comprobantes_pendientes_created_idx
  on public.comprobantes_transferencia (created_at) where estado = 'pendiente';

-- Último comprobante del usuario (VGRP-64).
create index comprobantes_user_created_idx
  on public.comprobantes_transferencia (user_id, created_at desc);

-- Índices de las FK que no tienen índice propio (ver VGRP-54).
create index comprobantes_cuenta_cobro_idx
  on public.comprobantes_transferencia (cuenta_cobro_id);
create index comprobantes_resuelto_por_idx
  on public.comprobantes_transferencia (resuelto_por) where resuelto_por is not null;

comment on table public.comprobantes_transferencia is
  'Comprobantes de transferencia subidos por los usuarios (VGRP-63). '
  'storage_path nunca debe ser legible por authenticated. Sin policies en '
  'esta migración: las policies y los grants por columna los agrega VGRP-63.';

alter table public.comprobantes_transferencia enable row level security;
revoke all on public.comprobantes_transferencia from anon, authenticated;
grant all on public.comprobantes_transferencia to service_role;
