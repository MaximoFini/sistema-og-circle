-- VGRP-88 / Bloque 16 — Materiales adicionales (descargables de /formacion).
-- Spec: specs/formacion-materiales/design.md §Data model.
--
-- Dos piezas: la tabla `materiales` (metadatos) y el bucket privado
-- `materiales` de Storage (el archivo). Nada de esto lo lee un cliente
-- directo: la lectura pasa por lib/data/materiales.ts y la descarga por la
-- Server Action descargarMaterial(), ambas con service_role.

create table public.materiales (
  id uuid primary key default gen_random_uuid(),
  titulo text not null check (length(btrim(titulo)) > 0),
  descripcion text,
  storage_path text not null unique,
  tipo text not null check (tipo in ('pdf', 'powerpoint', 'excel', 'word')),
  extension text not null
    check (extension in ('pdf', 'ppt', 'pptx', 'xls', 'xlsx', 'csv', 'doc', 'docx')),
  tamano_bytes bigint not null check (tamano_bytes > 0 and tamano_bytes <= 52428800),
  orden integer not null default 0,
  publicado boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table public.materiales is
  'Materiales descargables de /formacion (PDF, PowerPoint, Excel, Word). No van '
  'atados a un stage ni a un video. El archivo vive en el bucket privado '
  '`materiales`.';
comment on column public.materiales.storage_path is
  'SENSIBLE. Path del archivo en el bucket privado. Nunca sale al cliente: la '
  'descarga se resuelve con una URL firmada de corta duracion, despues de '
  'verificar el plan (Server Action descargarMaterial).';
comment on column public.materiales.tipo is
  'Derivado en el servidor desde la extension del archivo, nunca del body.';

-- Listado publico: solo publicados, por orden.
create index materiales_publicado_orden_idx on public.materiales (orden) where publicado;

-- -----------------------------------------------------------------------------
-- Grants + RLS (mismo criterio que agentes/videos, sin ninguna policy)
-- -----------------------------------------------------------------------------
-- Sin SELECT para authenticated a proposito: si un material se leyera con la
-- sesion del usuario, `storage_path` quedaria al alcance de cualquier cuenta,
-- con o sin plan. Lee y escribe solo service_role.
revoke all on public.materiales from anon, authenticated;
grant all on public.materiales to service_role;

alter table public.materiales enable row level security;

-- -----------------------------------------------------------------------------
-- Bucket privado
-- -----------------------------------------------------------------------------
-- 50 MB = limite por archivo del plan Free de Supabase (y MAX_BYTES de
-- lib/materiales/tipos.ts). Sin policies sobre storage.objects para
-- anon/authenticated: subir, firmar y borrar lo hace solo el servidor con
-- service_role; el navegador del admin sube con una URL de subida firmada.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'materiales',
  'materiales',
  false,
  52428800,
  array[
    'application/pdf',
    'application/vnd.ms-powerpoint',
    'application/vnd.openxmlformats-officedocument.presentationml.presentation',
    'application/vnd.ms-excel',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'text/csv',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;
