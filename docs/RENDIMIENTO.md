# Rendimiento

Reglas que salen del Bloque 10 (VGRP-54/55/56), la auditoría de rendimiento
sobre el sistema ya integrado. Este documento las junta a medida que cada
ticket del bloque las va escribiendo — VGRP-54 lo crea, VGRP-55 y VGRP-56 le
suman su sección cuando se implementen.

## Qué se mide y qué rompe el build

Ninguna optimización de este bloque se acepta sin medir antes/después con el
mismo método. Si un cambio no mueve la aguja, se revierte — complejidad que
no compra nada es deuda. Hoy nada de esto rompe el build automáticamente
(es responsabilidad de code review); VGRP-56 evalúa un presupuesto de
First Load JS en CI para la parte de bundle de cliente.

## VGRP-54 — un solo viaje de datos por pantalla

**Punto 1 (streaming de las grillas de Inicio) quedó bloqueado, no
implementado.** Pasar `AgentesGrid`/`ProfesionalesGrid`/`ServiciosFinancierosGrid`
a Server Components con datos por props desde `InicioShell` violaría la regla
dura de `lib/data/secretos.ts` (`resolverSecreto()` nunca se llama desde el
render de `/dashboard/[variante]`, que es prerenderizado y se sirve igual a
cualquier usuario logueado que pida esa URL a mano). Consolidar los 3
endpoints en uno, o cambiar el fallback de "Cargando…" por el esqueleto
`grillaFantasma`, rompería tests e2e pineados
(`e2e/canario-agentes-nivel.spec.ts`, `e2e/inicio-canario-swift.spec.ts`) que
verifican por URL/texto literal. Queda para una decisión de equipo — la
salida real probablemente requiere reabrir la conversación de Partial
Prerendering que STACK.md descarta hoy.

Reglas de los puntos que sí se implementaron (2, 4, 5, 6, 7, 8, 9):

1. **Los claims se verifican una vez por request.** `middleware.ts` ya corrió
   `getClaims()`; propaga el resultado por el header `x-vgrp-verified-claims`
   (`lib/auth/claims-header.ts`), que borra de la request ENTRANTE antes de
   volver a ponerlo — nunca confiar en un header que pudo mandar el cliente.
   `getVerifiedClaims()` (`lib/auth/server.ts`) lo lee con fallback a la
   verificación completa si no vino o vino corrupto.
2. **Todo segmento con un `await` de datos tiene `loading.tsx`, o el `await`
   va dentro de `<Suspense>`.** `app/(app)/loading.tsx` y
   `app/admin/loading.tsx` son el piso. En los listados de admin, el bloque
   de resultados va en `<Suspense>`; si el lede depende de la misma consulta
   que el listado (pagos, contenido), va adentro del mismo `Suspense` que los
   resultados — no se separa para no duplicar la query.
3. **Una ruta con `generateStaticParams` cubre TODOS los valores reales de su
   parámetro**, no un subconjunto — dejar uno afuera (acá, nivel `'ninguno'`,
   el más común) fuerza un render dinámico evitable en el caso más frecuente.
4. **Antes de encadenar dos `await` de I/O, preguntarse si el segundo usa el
   resultado del primero.** Si no, es `Promise.all` (criterio de referencia:
   `lib/data/admin/usuarios.ts`, `obtenerUsuario`).
5. **Nunca `count: 'exact'` sobre una columna calculada con subconsultas
   correlacionadas** (ver `admin_pagos_ledger.sin_aplicar`) en cada página de
   un listado paginado — calcularlo una sola vez (la primera página) y
   propagar `null` (no `0`) en las páginas siguientes, para no confundir "no
   se calculó" con "de verdad es cero".
6. **Toda FK nueva lleva su índice en la misma migración.** Postgres indexa
   la PK referenciada, nunca la columna que referencia. Y antes de crear un
   índice, mirar si una `unique` compuesta ya lo cubre por columna líder —
   si sí, el índice de una sola columna es redundante.
7. **Todo listado lleva `.limit()` explícito**, aunque la tabla hoy sea
   chica. `select('*')` sólo cuando se necesita la fila entera a propósito
   (p. ej. el valor anterior/nuevo de un audit log) — nunca sobre una tabla
   con una columna JSONB pesada que la pantalla ni siquiera muestra.

## Migraciones de este bloque pendientes de verificar en el proyecto real

Escritas en `supabase/migrations/` pero NO aplicadas ni medidas contra
`hsmodrhbwkromoixrxrt` desde ninguna sesión de esta rama — ese proyecto no
está entre los que ve el MCP de Supabase acá (cada dev loguea su propia
cuenta, ver CLAUDE.md). Quien las aplique tiene que completar la medición
antes de cerrar el ticket:

- `20260918210000_pagos_aprobados_indice_parcial.sql` — `EXPLAIN ANALYZE` de
  `contarPagosSinAplicar()` antes/después.
- `20260918211000_nivel_overrides_actor_id_idx.sql` — sin verificación
  adicional pendiente, es un índice puramente aditivo.
- `20260918212000_drop_pagos_proveedor_ref_idx_redundante.sql` — **no
  aplicar** sin antes confirmar con `pg_stat_user_indexes` que
  `pagos_proveedor_ref_idx` no tiene scans reales.
