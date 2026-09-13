-- VGRP-31 — permite stage=3 en `videos`: el video explicativo del directorio de
-- agentes de compra (1 video, distinto de Stage 1/formación y Stage 2/tienda).
-- Reusa la misma tabla y el mismo VideoProvider/mecanismo de VGRP-29 en vez de crear
-- una tabla o columna nueva. Aplicada con apply_migration del MCP de Supabase
-- (proyecto og-circle / hsmodrhbwkromoixrxrt / sa-east-1) el 2026-09-12; este archivo
-- la versiona.
alter table public.videos drop constraint videos_stage_check;
alter table public.videos add constraint videos_stage_check check (stage in (1, 2, 3));

comment on column public.videos.stage is
  '1 = Stage 1 (importaciones, 8 videos), 2 = Stage 2 (armado de tienda, 3 videos), '
  '3 = video explicativo del directorio de agentes (1 video) — VGRP-31.';
