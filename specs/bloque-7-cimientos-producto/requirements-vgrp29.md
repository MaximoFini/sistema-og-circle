# Requirements: VGRP-29 — VideoProvider y grillas de Stage 1 y Stage 2

**Status:** Draft
**Last updated:** 2026-09-09

## Summary

Reemplaza los placeholders de Stage 1 (8 videos) y Stage 2 (3 videos) de `InicioShell`
(VGRP-27) por grillas reales que leen de la tabla `videos` (VGRP-38), sirviendo el
`provider_ref` de YouTube a través de una interfaz `VideoProvider` para que migrar a Mux
en Fase 4 sea implementarla de nuevo, no refactorizar (contexto del propio ticket). Suma
"marcar video como visto", persistido en `profiles.progreso`.

Cubre 1 work item del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-29** — VideoProvider y grillas de Stage 1 y Stage 2 con placeholders.

Depende de VGRP-27 (shell, done) y VGRP-38 (tabla `videos` + CRUD + `TAG_POR_ENTIDAD`,
done). Los videos reales no están grabados — todo se construye y prueba contra filas de
prueba cargadas a mano vía el CRUD de VGRP-38, no contra contenido real.

## Goals

- Interfaz `VideoProvider` (sin acoplar ningún componente al SDK de YouTube) + una
  implementación para YouTube no listado.
- Grilla de Stage 1 (8 videos) y Stage 2 (3 videos), leyendo `videos` con rendering
  estático + `revalidateTag` (consumiendo `TAG_POR_ENTIDAD.videos`, ya definido por
  VGRP-38).
- Estado "próximamente" para cualquier video sin `publicado=true` o sin `provider_ref`.
- Marcar un video como visto, persistido en `profiles.progreso` por id de video.
- Contador de stats "X / 11 videos completados" (MODULOS.md §2) que se actualiza al
  marcar un video.

## Non-goals

- **Gating de nivel sobre videos.** El propio ticket lo dice explícito en "Notas
  técnicas": *"La formación completa está incluida en ambos niveles [...] No aplicar
  gating de nivel sobre los videos salvo que se decida lo contrario."* La columna
  `videos.nivel_requerido` sigue existiendo (paridad de schema, VGRP-38) y su policy de
  RLS sigue activa como red de seguridad, pero la lectura de este ticket usa
  service role (ver Decisiones) y no varía por usuario.
- **Reproductor de video custom / analytics de reproducción.** Sólo el embed estándar de
  YouTube (`<iframe>`) + un botón "marcar como visto"; no hay tracking de progreso dentro
  del video (segundos vistos, etc.) — "visto" es binario.
- **Migrar a Mux.** Es explícitamente Fase 4 (roadmap) — este ticket sólo deja la interfaz
  lista para que ese día sea una implementación nueva de `VideoProvider`, no un refactor.
- **Ticker de "envíos activos"** de MODULOS.md §2 (stats del usuario) — es Fase 3, fuera
  de alcance (mismo criterio ya aplicado en VGRP-27 requirements.md).
- **Cargar los 11 videos reales.** No están grabados. Se prueba con filas de test creadas
  y borradas durante la verificación (mismo patrón de VGRP-38), tabla vacía al cerrar el
  ticket.

## User stories

### US-1: `VideoProvider` — abstracción sobre el proveedor de video

Como equipo, queremos que ningún componente hable directamente con YouTube, para que
migrar a Mux en Fase 4 sea una implementación nueva de la interfaz, no un refactor de
toda la UI.

**Acceptance criteria:**

- THE SYSTEM SHALL definir una interfaz `VideoProvider` con al menos: URL de embed y URL
  de thumbnail a partir de un `provider_ref`.
- THE SYSTEM SHALL implementar `VideoProvider` para YouTube no listado (embed vía
  `youtube.com/embed/:id`, thumbnail vía `i.ytimg.com/vi/:id/...`).
- THE SYSTEM SHALL NOT permitir que ningún componente de UI importe una URL/SDK de
  YouTube directamente — todo pasa por la implementación de `VideoProvider`.

### US-2: Grillas de Stage 1 y Stage 2, leídas de la tabla `videos`

Como usuario logueado, quiero ver la formación de Stage 1 (importaciones) y Stage 2
(armado de tienda) organizada en dos grillas, con el estado real de cada video.

**Acceptance criteria:**

- THE SYSTEM SHALL leer los videos de `stage=1` (hasta 8) y `stage=2` (hasta 3) desde la
  tabla `videos`, ordenados por `orden`.
- WHEN una fila tiene `publicado=true` Y `provider_ref` no vacío THE SYSTEM SHALL
  mostrarla como disponible, con thumbnail y embed resueltos por `VideoProvider`.
- WHEN una fila tiene `publicado=false` O `provider_ref` vacío/null THE SYSTEM SHALL
  mostrarla en estado "próximamente" (sin thumbnail, sin embed, sin exponer
  `provider_ref` aunque exista en la fila).
- WHEN hay menos de 8 filas de `stage=1` (o menos de 3 de `stage=2`) cargadas en la tabla
  THE SYSTEM SHALL completar la grilla con tiles "próximamente" sintéticos hasta el
  tamaño fijo del stage (8 / 3), para que la grilla nunca se vea incompleta ni cambie de
  tamaño según cuánto haya cargado el admin — ver Decisiones.
- THE SYSTEM SHALL servir ambas grillas como parte del rendering estático de
  `/dashboard/[variante]` (sin `cookies()`/claims en el camino de lectura de videos) y
  revalidarlas por tag (`TAG_POR_ENTIDAD.videos`, ya disparado por cada escritura de
  VGRP-38) — verificable en el output de `pnpm build` (ninguna ruta nueva se vuelve
  dinámica sólo por esto).
- THE SYSTEM SHALL funcionar en mobile (grilla responsive, sin overflow horizontal).

### US-3: `provider_ref` nunca llega al cliente sin publicar

Como responsable del producto, quiero que el id de YouTube no listado no se filtre para
contenido no publicado, sea cual sea el cliente que arme la consulta.

**Acceptance criteria:**

- THE SYSTEM SHALL resolver `provider_ref` → URL de embed/thumbnail únicamente dentro de
  un archivo con `import "server-only"` como primera línea (mismo patrón que
  `resolverSecreto()`, VGRP-30).
- IF una fila no está publicada THEN THE SYSTEM SHALL NOT incluir su `provider_ref` (ni
  una URL derivada de él) en ninguna respuesta que llegue al cliente — verificado con un
  test de integración, no sólo por inspección visual.

### US-4: Marcar un video como visto

Como usuario logueado, quiero marcar un video como visto para llevar registro de mi
progreso en la formación.

**Acceptance criteria:**

- WHEN un usuario marca un video disponible como visto THE SYSTEM SHALL persistir el id
  del video en `profiles.progreso` (propia fila, nunca la de otro usuario).
- THE SYSTEM SHALL ser idempotente: marcar el mismo video dos veces no duplica su id ni
  rompe el conteo.
- THE SYSTEM SHALL NOT permitir marcar como visto un video en estado "próximamente" (no
  hay nada que ver todavía).
- WHEN un video se marca como visto THE SYSTEM SHALL actualizar en la misma pantalla el
  contador de stats ("X / 11 videos completados", MODULOS.md §2) sin necesitar recargar
  la página.

## Constraints

- **Reutilización obligatoria:** `createServiceRoleClient()`, `createSupabaseServerClient()`
  / `getVerifiedClaims()`, `TAG_POR_ENTIDAD` (`lib/data/admin/contenido.ts`) — ninguno se
  reimplementa.
- **`import "server-only"`** en el archivo que resuelve `provider_ref` (pedido explícito
  del ticket, "Notas técnicas").
- **Nunca DELETE real sobre `videos`** — ya lo garantiza `lib/data/admin/contenido.ts`
  (VGRP-38, soft-delete vía `publicado=false`); este ticket no agrega una vía nueva de
  borrado.
- **Server Actions para la mutación** (marcar visto) y no un Route Handler nuevo — mismo
  patrón ya usado en `app/(app)/comprar/_actions.ts` (`crearCheckout`,
  `consultarNivelActual`) para mutaciones/lecturas gatilladas desde un Client Component
  con sesión.
- **CI en verde:** typecheck + `biome ci` + build (verificar que `/dashboard/[variante]`
  sigue estático) + Vitest, incluyendo un test de integración de que `provider_ref` no
  sale para una fila no publicada.

## Decisiones asumidas (2026-09-09)

Estas no son ambigüedades de negocio de alto riesgo (no tocan seguridad de secretos ni
dinero) — se documentan acá para que quede explícito el criterio, sujeto a ajuste si el
equipo lo pide:

- **Filas con `publicado=false` siguen apareciendo en la grilla** (como "próximamente"),
  en vez de ocultarse. Es lectura directa del propio ticket ("Estado 'próximamente' para
  los videos con `publicado=false`..."), y es lo que sostiene el criterio de aceptación
  "con cero videos publicados, ambas grillas se ven intencionales". Efecto secundario: si
  algún día se "despublica" un video ya visto (caso raro, no pedido hoy), reaparece como
  "próximamente" en vez de desaparecer — aceptable para un catálogo de tamaño fijo (8+3).
- **Tamaño fijo de grilla (8 y 3), no derivado de cuántas filas haya en la tabla.** El
  propio ticket fija esos números ("Grilla de Stage 1: 8 videos", "Grilla de Stage 2: 3
  videos") y MODULOS.md §2 fija el contador en formato "X / 11" (8+3). Si la tabla tiene
  menos filas que el tamaño del stage, se completa con tiles "próximamente" sintéticos
  (sin id, no marcables); si tuviera más (no debería pasar con un catálogo cerrado), sólo
  se muestran las primeras `N` por `orden`.
- **Corrección de una inconsistencia menor del ticket:** las "Notas técnicas" dicen "usar
  `activo = false`" para no borrar videos, pero la tabla `videos` (VGRP-38) no tiene
  columna `activo`, sólo `publicado` — y `lib/data/admin/contenido.ts` ya implementa el
  soft-delete de `videos` con `publicado=false`. Se toma esa columna real, no se agrega
  `activo` a la tabla.
- **Forma de `profiles.progreso`:** `{ "videosVistos": string[] }` (ids de `videos`). No
  había ninguna convención previa (la columna es `jsonb not null default '{}'` sin
  consumidores hasta este ticket, confirmado leyendo `app/admin/usuarios/[id]/page.tsx`,
  que hoy sólo la vuelca como JSON crudo). Se documenta acá porque futuros tickets que
  también escriban `progreso` (envíos, Fase 3) van a necesitar saber esta forma para
  mergear en vez de pisarla.
