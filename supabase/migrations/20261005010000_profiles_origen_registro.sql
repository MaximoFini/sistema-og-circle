-- =============================================================================
-- VGRP-76 / Bloque 15 — profiles.origen_registro
-- =============================================================================
-- De qué botón de la landing vino cada usuario (o si entró directo). Lo escribe
-- el servidor con service_role una única vez, al crearse la cuenta
-- (`guardarOrigenSiFalta()` en lib/auth/origen-server.ts), desde el registro
-- con email y desde el callback de Google.
--
-- Lista cerrada: la misma que `ORIGENES` en lib/auth/origen.ts. Si se suma un
-- CTA nuevo a la landing, se cambian los dos lugares juntos.
--
-- `null` = cuenta creada antes de este ticket (no se sabe de dónde vino). No se
-- hace backfill: inventar un valor ensuciaría la métrica de origen.
-- =============================================================================

alter table public.profiles
  add column origen_registro text
  constraint profiles_origen_registro_check check (
    origen_registro in (
      'landing-nav',
      'landing-hero',
      'landing-menu-mobile',
      'landing-precios-principiante',
      'landing-precios-avanzado',
      'directo',
      'otro'
    )
  );

comment on column public.profiles.origen_registro is
  'Origen del registro (VGRP-76): CTA de la landing, ''directo'' u ''otro''. '
  'Lo escribe sólo service_role, una vez, al crear la cuenta. null = cuenta '
  'anterior al tracking.';

-- Sin grant de update a `authenticated`, a propósito: los grants por columna
-- de profiles (init_plataforma.sql, sección 6) sólo abren nombre, telefono,
-- progreso y la aceptación de términos. El usuario no puede editar su origen.
