-- VGRP-38 / Bloque 7 — Tablas de contenido: agentes, videos, profesionales,
-- servicios_financieros. Mismo patrón de grants + RLS que
-- 20260822035923_init_plataforma.sql. Aplicada con apply_migration del MCP de
-- Supabase (proyecto og-circle / hsmodrhbwkromoixrxrt / sa-east-1) el
-- 2026-09-09; este archivo la versiona.

create table public.agentes (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  especialidad text not null,
  nivel_requerido nivel_acceso not null default 'principiante',
  contacto text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.agentes is
  'Directorio de agentes de compra en China. contacto es el dato que se vende -- '
  'nunca se lee fuera de service_role o de resolverSecreto() (VGRP-30).';
comment on column public.agentes.contacto is
  'SENSIBLE. Nunca seleccionar esta columna en una query que pueda llegar a un '
  'usuario sin el nivel_requerido de la fila.';

create table public.videos (
  id uuid primary key default gen_random_uuid(),
  stage smallint not null check (stage in (1, 2)),
  titulo text not null,
  descripcion text,
  provider_ref text,
  nivel_requerido nivel_acceso not null default 'principiante',
  orden integer not null default 0,
  publicado boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on column public.videos.nivel_requerido is
  'Existe en el schema por paridad con agentes/servicios, pero VGRP-29 documenta '
  'que la formacion NO se gatea por nivel (PRD Fase 2 S1.1: ambos niveles ven '
  'todo el contenido educativo). En la practica queda siempre en principiante.';
comment on column public.videos.provider_ref is
  'SENSIBLE. No sale al cliente si publicado=false, sea cual sea el nivel.';

create table public.profesionales (
  id uuid primary key default gen_random_uuid(),
  nombre text not null,
  rubro text not null,
  descripcion text,
  contacto text,
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.profesionales is
  'Sin nivel_requerido a proposito (decision confirmada 2026-09-09): igual para '
  'Principiante y Avanzado, mismo criterio que los videos.';

create table public.servicios_financieros (
  id uuid primary key default gen_random_uuid(),
  titulo text not null,
  descripcion text,
  nivel_requerido nivel_acceso not null default 'principiante',
  orden integer not null default 0,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Grants (mismo criterio que profiles/pagos/admin_audit_log)
-- -----------------------------------------------------------------------------
revoke all on public.agentes, public.videos, public.profesionales,
  public.servicios_financieros from anon, authenticated;
grant select on public.agentes, public.videos, public.profesionales,
  public.servicios_financieros to authenticated;
grant all on public.agentes, public.videos, public.profesionales,
  public.servicios_financieros to service_role;

-- -----------------------------------------------------------------------------
-- Row Level Security
-- -----------------------------------------------------------------------------
-- (select auth.jwt()) envuelto en subselect — optimización de RLS recomendada
-- por Supabase (se evalúa una vez por query, no una vez por fila).

alter table public.agentes enable row level security;
alter table public.videos enable row level security;
alter table public.profesionales enable row level security;
alter table public.servicios_financieros enable row level security;

-- agentes / videos / servicios_financieros: SELECT sólo de filas
-- activas/publicadas cuyo nivel_requerido alcance el nivel del claim. Fila
-- entera oculta si no — red de seguridad (VGRP-30 US-4); la UX fina
-- (publicMeta visible igual aunque el secreto esté bloqueado) la resuelve la
-- app con service_role + resolverSecreto(), no esta policy.
create policy "agentes_select_por_nivel"
on public.agentes
for select
to authenticated
using (
  activo
  and nivel_requerido <= (((select auth.jwt()) -> 'app_metadata' ->> 'nivel')::nivel_acceso)
);

create policy "videos_select_por_nivel"
on public.videos
for select
to authenticated
using (
  publicado
  and nivel_requerido <= (((select auth.jwt()) -> 'app_metadata' ->> 'nivel')::nivel_acceso)
);

create policy "servicios_financieros_select_por_nivel"
on public.servicios_financieros
for select
to authenticated
using (
  activo
  and nivel_requerido <= (((select auth.jwt()) -> 'app_metadata' ->> 'nivel')::nivel_acceso)
);

-- profesionales: sin nivel_requerido (decisión confirmada 2026-09-09) —
-- cualquier autenticado ve las filas activas.
create policy "profesionales_select_activos"
on public.profesionales
for select
to authenticated
using ( activo );
