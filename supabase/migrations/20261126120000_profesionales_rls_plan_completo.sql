-- Auditoría de seguridad (nov 2026): la policy `profesionales_select_activos`
-- (20260909041306) dejaba a CUALQUIER autenticado, también sin plan, leer la tabla
-- completa por PostgREST — incluida la columna `contacto`. La app lo tapaba en el
-- servidor (`resolverSecreto`), pero con el anon key + el JWT propio se podía
-- consultar directo. Se alinea con agentes/videos/servicios_financieros
-- (20261002190000_plan_unico): fila activa Y claim de nivel 'completo'.
--
-- La app lee `profesionales` con service role (lib/data/profesionales.ts), así que
-- el listado borroso para usuarios sin plan no depende de esta policy.

drop policy "profesionales_select_activos" on public.profesionales;

create policy "profesionales_select_con_acceso"
on public.profesionales
for select
to authenticated
using (
  activo
  and ((select auth.jwt()) -> 'app_metadata' ->> 'nivel') = 'completo'
);
