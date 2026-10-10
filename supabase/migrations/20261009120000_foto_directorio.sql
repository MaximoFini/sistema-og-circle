-- Foto de perfil de agentes de compra y profesionales.
-- Spec: specs/foto-perfil-agentes-profesionales/{requirements,design}.md
--
-- Aplicar a mano en el SQL Editor de Supabase (proyecto og-circle). Idempotente:
-- se puede correr dos veces sin romper nada.

-- 1) Columna con la ruta del objeto en Storage. null = sin foto.
alter table public.agentes
  add column if not exists foto_path text;
alter table public.profesionales
  add column if not exists foto_path text;

comment on column public.agentes.foto_path is
  'Ruta del objeto en el bucket fotos-directorio (<entidad>/<id>/<uuid>.webp). '
  'null = sin foto. Sólo la escribe el endpoint /api/admin/contenido/:entidad/:id/foto.';
comment on column public.profesionales.foto_path is
  'Ruta del objeto en el bucket fotos-directorio (<entidad>/<id>/<uuid>.webp). '
  'null = sin foto. Sólo la escribe el endpoint /api/admin/contenido/:entidad/:id/foto.';

-- 2) Bucket público de lectura: las fotos no son datos sensibles (el contacto sí
--    y sigue gateado). Sólo WebP y hasta 2 MB: el servidor re-encodea todo a
--    WebP 512x512 antes de subir. Sin policies sobre storage.objects para
--    anon/authenticated: escribe únicamente service_role.
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('fotos-directorio', 'fotos-directorio', true, 2097152, array['image/webp'])
on conflict (id) do update
  set public = excluded.public,
      file_size_limit = excluded.file_size_limit,
      allowed_mime_types = excluded.allowed_mime_types;
