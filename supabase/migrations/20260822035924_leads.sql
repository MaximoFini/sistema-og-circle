-- =============================================================================
-- VGRP-15 — leads (migración defensiva, separada por incertidumbre real)
-- =============================================================================
-- ADVERTENCIA — LEER ANTES DE APLICAR:
-- `leads` ya existe desde la Fase 1, pero en un proyecto de Supabase real que
-- no es este repo (este repo no tenía carpeta de migraciones hasta ahora). No
-- hay forma, desde esta máquina, de confirmar si `leads` hoy vive en ese
-- Supabase o en @vercel/kv — es una decisión abierta y NO se resuelve acá.
--
-- Esta migración es best-effort: `create table if not exists` con una forma
-- razonable inferida del modelo de datos del ticket. Antes de correr esto
-- contra el proyecto real:
--   1. Confirmar en el dashboard de Supabase (o con
--      `supabase db dump --schema public` una vez linkeado) si `leads` ya
--      existe y qué columnas tiene.
--   2. Si existe y la forma difiere de la de acá abajo, esta migración NO se
--      aplica ciegamente — se ajusta esta migración (o se reemplaza por un
--      `alter table` incremental) para que coincida con el schema real.
--   3. Si la fuente de verdad de leads termina siendo @vercel/kv en vez de
--      Supabase, esta migración se descarta directamente.
-- =============================================================================

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  nivel_interes public.nivel_acceso,
  origen text,
  created_at timestamptz not null default now()
);

comment on table public.leads is
  'MIGRACIÓN BEST-EFFORT — ver advertencia arriba. Forma inferida, no '
  'confirmada contra el schema real de Supabase de Fase 1. leads podría vivir '
  'en @vercel/kv en lugar de acá; decisión abierta, no resuelta por este '
  'ticket.';

alter table public.leads enable row level security;

-- Matriz de acceso del ticket: anon puede INSERT (formulario público de
-- captura de leads), nadie más tiene acceso desde el cliente. service_role
-- bypasea RLS y ya tiene grants completos por defecto en Supabase.
revoke all on public.leads from anon, authenticated;
grant insert on public.leads to anon;
grant all on public.leads to service_role;

create policy "leads_insert_anon"
on public.leads
for insert
to anon
with check ( true );
