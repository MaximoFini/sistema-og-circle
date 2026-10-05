-- =============================================================================
-- VGRP-26 — profiles.bienvenida_enviada_at
-- =============================================================================
-- Marca cuándo se envió el email de bienvenida. Sirve de guard de idempotencia:
-- el callback de Google reenvía sólo si esta columna está vacía, y el registro
-- con email la setea al enviar OK.
--
-- Sin grant de update a `authenticated`, a propósito: la escribe sólo el
-- servidor con service_role (`dispararBienvenida()` en lib/email/bienvenida.ts).
-- El usuario no puede marcar ni desmarcar el envío a mano.
--
-- Backfill: las cuentas existentes se marcan como ya bienvenidas. Sin esto, el
-- primer login con Google de cualquier usuario anterior dispararía un email de
-- bienvenida que no corresponde.
-- =============================================================================

alter table public.profiles
  add column bienvenida_enviada_at timestamptz;

comment on column public.profiles.bienvenida_enviada_at is
  'Momento en que se envió el email de bienvenida (VGRP-26). Lo escribe sólo '
  'service_role, tras un envío OK. null = todavía no enviado. El callback de '
  'Google lo usa para no reenviar en logins posteriores.';

update public.profiles
  set bienvenida_enviada_at = now()
  where bienvenida_enviada_at is null;

-- Sin grant de update: ver el encabezado. profiles conserva sólo los grants por
-- columna de init_plataforma.sql (sección 6) y terminos_aceptados.
