-- Contacto (teléfono / WhatsApp de la persona a la que hay que escribir) de los
-- servicios financieros. Sensible como el de agentes y profesionales: sólo se
-- expone con el plan completo (resolverSecreto en lib/data/servicios.ts).
--
-- Aplicar a mano en el SQL Editor de Supabase. Idempotente.

alter table public.servicios_financieros
  add column if not exists contacto text;

comment on column public.servicios_financieros.contacto is
  'Contacto de la persona a la que hay que hablar. Sensible: sólo con plan completo.';
