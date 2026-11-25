-- Foto de perfil (logo) de los servicios financieros.
-- Spec: specs/foto-perfil-agentes-profesionales/ (misma infraestructura: bucket
-- fotos-directorio, mismo endpoint /api/admin/contenido/:entidad/:id/foto).
--
-- Aplicar a mano en el SQL Editor de Supabase (proyecto og-circle). Idempotente.
-- El bucket ya existe (migración 20261009120000_foto_directorio.sql).

alter table public.servicios_financieros
  add column if not exists foto_path text;

comment on column public.servicios_financieros.foto_path is
  'Ruta del objeto en el bucket fotos-directorio (<entidad>/<id>/<uuid>.webp). '
  'null = sin foto. Sólo la escribe el endpoint /api/admin/contenido/:entidad/:id/foto.';
