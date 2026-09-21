# Rendimiento

Documento único de reglas de rendimiento del proyecto: rendering/caching
(VGRP-54), caché persistente/revalidación/prefetch (VGRP-55) y bundle de
cliente + presupuesto en CI (VGRP-56) — el Bloque 10, auditoría de
rendimiento sobre el sistema ya integrado. Enlazado desde `STACK.md` §8 y
desde la checklist de `CLAUDE.md`.

## Qué se mide y qué rompe el build

Ninguna optimización de este bloque se acepta sin medir antes/después con el
mismo método. Si un cambio no mueve la aguja, se revierte — complejidad que
no compra nada es deuda. La única parte que rompe el build automáticamente
hoy es el presupuesto de First Load JS de VGRP-56
(`scripts/check-bundle-budget.mjs`, en CI después del `Build`); el resto de
las reglas de este documento son responsabilidad de code review.

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

## VGRP-55 — caché persistente, revalidación y prefetch

Todos los puntos implementados salvo el 2 (no hizo falta código) y el 8, que
queda sin medir de verdad — requiere logs reales de Vercel en producción, no
disponibles desde esta sesión. Sí se agregó una validación parcial y barata:
`middleware.test.ts` ("matcher — el middleware no corre sobre assets
estáticos") fija por test que el `matcher` siga excluyendo `_next`/favicon/
robots/sitemap/extensiones de imagen — la palanca más grande sobre el costo
agregado del middleware (que corra sólo donde tiene algo que proteger) — sin
necesitar la medición de latencia en sí.

1. **La lectura de filas se cachea; el gating por claims se aplica SIEMPRE
   afuera, nunca dentro del `unstable_cache`.** `lib/data/agentes.ts`,
   `profesionales.ts` y `servicios.ts` cachean el valor CRUDO de la base
   (incluido el secreto sin resolver); `resolverSecreto()`/el chequeo de
   sesión corren después, con los claims reales de cada request. Si algún
   día alguien cachea el resultado YA resuelto, es el mismo bug que el
   canario de VGRP-50 existe para detectar.
2. **`unstable_cache` no corre fuera del runtime real de Next** (tira
   `Invariant: incrementalCache missing`) — cualquier variante cacheada de
   una función necesita un fallback a la lectura sin caché para no romper
   tests que invocan un Route Handler directo (patrón repetido en
   `lib/data/agentes.ts`, `profesionales.ts`, `servicios.ts`,
   `lib/config/index.ts`).
3. **Sembrar datos de test con un insert directo a la tabla ya no alcanza**
   para nada que pase por una lectura cacheada — el insert no dispara
   `revalidateTag`. Los tests (e2e o unitarios) tienen que sembrar por el
   mismo camino que un escritor real (la API de admin), o simular
   `revalidateTag` a mano si mockean `next/cache`. Ver
   `test/helpers/admin-content-seed.ts`.
4. **Un `<Link>` que no está montado no se prefetchea.** Si un destino de
   navegación vive detrás de un `return null` (un drawer cerrado, un tab
   inactivo), prefetchealo por otra vía (`router.prefetch()` al hover/focus
   del trigger) en vez de asumir que Next lo hace solo.
5. **Todo asset de `public/` lleva su header de cache explícito**
   (`next.config.ts`, `headers()`) — Next sólo se ocupa de `/_next/static`.
   Los endpoints por-usuario declaran `private, no-store` explícito, aunque
   ya sean dinámicos por otra razón.

## VGRP-56 — bundle de cliente y presupuesto en CI

Línea de base (punto 0, `next build` sin `ANALYZE`, ya con VGRP-54/55
aplicados): First Load JS compartido 186 kB; rutas más pesadas eran
`/comprar/pendiente` (255 kB) y `/login`/`/perfil`/`/recuperar`/
`/recuperar/nueva`/`/registro` (207 kB, mismo `_schemas.ts` con `zod` a
nivel de módulo).

Delta medido por punto — a propósito no hay un total agregado (esconde cuál
cambio sirvió y cuál no):

| Punto | Cambio | Delta medido |
|---|---|---|
| 1 | `zod` fuera de `INITIAL_ACTION_STATE` (`_action-state.ts` sin dependencias) | `/login`, `/perfil`, `/recuperar`, `/recuperar/nueva`, `/registro`: 207 kB → 190 kB (**-17 kB** cada una) |
| 2 | `DashboardHeader` → Server Component, `MenuToggle` como hoja cliente | Sin baja medible en `next build` (el header ya vivía en el chunk compartido de `(app)`, no por-ruta) — el beneficio es un boundary de cliente más chico e hidratación más liviana, no bytes descargados |
| 3 | `TextFieldBase` sin `useId()` en los 3 filtros de admin | Sin baja medible (el chunk de `TextField` ya era chico y compartido) — mismo tipo de beneficio que el punto 2 |
| 4 | Partir el barril `components/ui` | **Revertido antes de tocar nada.** `ANALYZE=true` + parseo del stats JSON: `Checkbox.tsx` pesa 376 B gzip y aparece en 23 chunks (~8.6 kB total repartidos en toda la app). Tocar 30 archivos para eso es deuda, no optimización — queda anotado, no implementado |
| 5 | Logo: `width`/`height` al tamaño pintado (98×95, no 630×612), sin `priority` | No es una métrica de JS — el ahorro es de bytes de imagen (deja de bajar la variante de ~640px para pintar 98px) |
| 6 | Thumbnail de YouTube: `mqdefault.jpg` (320×180) en vez de `hqdefault.jpg` (480×360) | No es una métrica de JS — ~1/3 del peso por thumbnail, ~12 por carga de Inicio |
| 7a | `images.formats: ["image/avif", "image/webp"]` | No medible por bundle analyzer (afecta al pipeline de `next/image`, no al JS que baja el browser) |
| 7b | `experimental.optimizePackageImports` para `zod`/`@sentry/nextjs` | **Revertido.** Medido con `ANALYZE=true`: First Load JS compartido idéntico (186 kB) antes/después; ninguna ruta bajó. Ambos paquetes ya son ESM con exports nombrados, sin el problema de barril que este flag resuelve |
| 9 | Presupuesto de First Load JS en CI (`scripts/check-bundle-budget.mjs`) | No aplica — es el mecanismo de medición, no una optimización |

Estado final (`next build`, todos los puntos aplicados): shared 186 kB sin
cambio respecto a la línea de base; ninguna ruta por encima de lo medido en
el punto 1.

### Fuentes — el plan para el día que se carguen (punto 8, sin implementar)

`app/tokens.css` declara 4 familias (Helvetica Now Var, Montserrat, Inter,
Cormorant Garamond) y hoy no carga ninguna: cero `next/font`, cero
`@font-face`, cero `<link>`. Cae al stack de sistema — sin FOUT ni CLS por
fuentes porque no hay fuentes. Cargarlas es un cambio visual y este bloque
no toca UI, así que esto es sólo el plan escrito para no repetir el camino
caro que hoy describe `DESIGN.md` (que documenta la landing pública, un
deploy distinto — ver nota al principio de ese archivo).

Pesos que alguna regla CSS de **este** repo realmente usa hoy (no el rango
completo que carga la landing):

- **Montserrat** (`--font-heading`): 300 (`nav.module.css`, wordmark), 700
  (`video.module.css`, título de paso), 800/900 (`tokens.css`,
  `--text-h2-weight`/`--text-h1-weight`).
- **Helvetica Now Var** (`--font-body`): peso por defecto (texto general),
  600 (`video.module.css`).
- **Inter** (`--font-body-alt`) y **Cormorant Garamond**
  (`--font-serif-display`): declaradas en `tokens.css` pero **ninguna regla
  CSS de este repo las usa hoy** (grep sobre los 18 módulos: cero) — no
  cargarlas hasta que un componente real las consuma.

Receta cuando se implemente:

1. **Montserrat** — `next/font/google` con `weight: ["300", "700", "800", "900"]`
   y `display: "swap"`. No el rango `300-900` + itálica que carga la landing.
2. **Helvetica Now Var** — hoy viaja desde un CDN de terceros
   (`db.onlinewebfonts.com`); es una fuente variable, así que
   `next/font/local` con el woff2 auto-hospedado cubre los pesos que hagan
   falta con un solo archivo (no uno por peso, a diferencia de Montserrat) y
   saca el DNS+TLS extra a un tercero del camino crítico.
3. **Inter / Cormorant Garamond** — no cargar todavía. Mismo criterio de
   "no sin medir" del resto del ticket, aplicado a fuentes: no hay
   FOUT/CLS que evitar en una familia que ningún componente pinta.

### Presupuesto de First Load JS en CI

`scripts/check-bundle-budget.mjs`, invocado desde `.github/workflows/ci.yml`
después del `Build`, parsea la tabla que `next build` ya imprime (no
reinventa el cálculo leyendo manifests a mano) y **rompe el build** si:

- el shared chunk (`First Load JS shared by all`) supera 195 kB, o
- alguna ruta supera su presupuesto: 200 kB por default, con dos
  excepciones ya medidas y justificadas — `/admin/config` (215 kB, panel
  con varios formularios) y `/comprar/pendiente` (265 kB, arrastra
  `@supabase/ssr` + `supabase-js` para el polling con `refreshSession()`
  en el browser, anotado como fuera de alcance de este bloque).

Verificado rompiendo a propósito (presupuesto bajado a 100 kB sobre el log
real de `next build`): el check falla con exit code 1 y un mensaje que
nombra cada ruta y el exceso exacto en kB. Subir un presupuesto es una
decisión consciente que se explica en el PR — no un arreglo de CI en rojo.

### Reglas que quedan escritas (VGRP-56)

1. **`"use client"` va en la hoja, nunca en un layout ni en una page.** Si
   un archivo tiene `"use client"` y además renderiza markup estático, está
   mal ubicado — se parte (caso testigo: punto 2).
2. **Un módulo que importa una librería pesada a nivel de módulo no se
   importa desde un Client Component.** Constantes y tipos compartidos van
   en un archivo sin dependencias (caso testigo: `zod` viajando al browser
   para transportar un `{}`, punto 1).
3. **No importar desde el barril `@/components/ui` en Server Components —
   import directo al archivo, cuando la medición lo justifique.** Hoy
   (punto 4) el costo medido es 376 B gzip en 23 chunks — no justifica
   partir 30 archivos, así que queda como preferencia, no como bloqueo. Si
   el barril crece con componentes más pesados, medir de nuevo.
4. **`priority` en `next/image` es para el LCP y nada más: uno por página
   como máximo, y nunca en una imagen decorativa.** `width`/`height` van
   con el tamaño **pintado**, no con el del archivo fuente (punto 5).
5. **Toda `<img>` nativa lleva `width`, `height`, `loading="lazy"` y
   `decoding="async"`**, y se le pide al proveedor la resolución más chica
   que cubra el slot (punto 6).
6. **Fuentes: `next/font` siempre, sólo los pesos que alguna regla CSS
   nombra.** Ninguna familia se carga sin que algún componente la use
   (Inter/Cormorant Garamond, arriba). Un `<link>` a un CDN de fuentes de
   terceros necesita justificación escrita.
7. **`server-only` en todo módulo que toque base, secretos o SDK de
   backend.** Se cumple al 100% hoy — no se afloja, y menos en un PR de
   rendimiento.
8. **Ninguna dependencia nueva entra sin medirla**, y ningún PR que toque
   `package.json` o un Client Component se mergea sin el reporte del
   analyzer. El presupuesto en CI (arriba) lo hace cumplir solo.

## Migraciones de este bloque, estado contra el proyecto real

- `20260918210000_pagos_aprobados_indice_parcial.sql` — aplicada por Ramiro
  vía SQL Editor. `EXPLAIN ANALYZE` de antes/después de `nivel_vigente()`
  pendiente de pegar en el ticket (índice ya creado, falta sólo el número).
- `20260918211000_nivel_overrides_actor_id_idx.sql` — aplicada. Sin
  verificación adicional pendiente, es un índice puramente aditivo.
- ~~`20260918212000_drop_pagos_proveedor_ref_idx_redundante.sql`~~ —
  **descartada, NO se aplica.** El propio punto 8 del ticket pedía
  confirmar con `pg_stat_user_indexes` antes de borrar
  `pagos_proveedor_ref_idx`: contra el proyecto real dio `idx_scan = 5232`
  (verificado 2026-09-19) — tiene uso real, así que borrarlo sería una
  regresión de performance, no una limpieza. Migración eliminada del
  branch en vez de dejarla sin aplicar (una migración "no aplicar todavía"
  que nadie recuerda por qué es un `drop index` esperando a ejecutarse por
  error). Análisis original (por qué se pensó redundante) sigue en el
  commit `dbe403c` si hace falta retomarlo con un caso de uso distinto.
