-- =============================================================================
-- VGRP-15 — leads
-- =============================================================================
-- RESUELTO (2026-08-22): la landing no está capturando leads todavía — no
-- hay dato real en ningún lado (ni Supabase ni @vercel/kv) con el que esta
-- migración pueda entrar en conflicto. La incertidumbre original (¿leads ya
-- existía en otro proyecto, con otra forma?) queda cerrada: esta tabla es la
-- fuente de verdad de acá en adelante. Ver docs/SUPABASE-SETUP.md.
-- Ya aplicada contra el proyecto real (og-circle, hsmodrhbwkromoixrxrt).
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
