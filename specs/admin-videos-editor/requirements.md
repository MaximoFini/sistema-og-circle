# Requirements: Editor de videos del admin (réplica del Inicio)

**Status:** Approved (2026-10-08)
**Last updated:** 2026-10-08 (v2: los despublicados dejan de ocupar casilla; videos de prueba ya eliminados)

## Summary

En `/admin/contenido/videos`, los administradores gestionan los videos de Formación (Stage 1 y Stage 2) sobre una réplica de lo que ve el usuario en `/dashboard`: las mismas grillas y casillas, pero editables. Cada casilla se toca para crear o editar un video en un panel, y los videos se reordenan arrastrando.

## Goals

- Que el admin vea y gestione los videos exactamente como los va a ver el usuario: mismas grillas (Stage 1 de 8 casillas, Stage 2 de 3), mismos títulos de sección y mismo aspecto de casilla.
- Crear, editar, despublicar y reordenar videos sin salir de esa pantalla.
- Reutilizar los componentes de grilla y casilla del Inicio, de modo que un cambio visual en el Inicio se refleje solo en el editor.

## Non-goals

- **Stage 3** (video explicativo de Agentes): queda fuera de este editor.
- **Mover un video de un stage a otro** arrastrando: no se permite.
- **Borrado definitivo** de videos: se mantiene "Despublicar" (soft-delete, `publicado = false`).
- Dejar **huecos** en el medio de una grilla: las casillas vacías siempre están al final.
- Cambios en el modelo de datos de `videos` ni en la API de contenido. Sí cambia la **lectura** del Inicio del usuario en un único punto: los videos despublicados dejan de ocupar casilla (ver US-1 y Constraints).
- Una papelera o recuperación de videos: un video despublicado se puede volver a publicar, pero no hay deshacer más allá de eso.
- Los otros contenidos del admin (agentes, profesionales, servicios financieros) no cambian.

## User stories

### US-1: Ver las grillas como las ve el usuario

As a administrador, I want ver Stage 1 y Stage 2 con el mismo aspecto que en el Inicio, so that entiendo de un vistazo cómo queda lo que cargo.

**Acceptance criteria** (EARS format):

- WHEN un admin abre `/admin/contenido/videos` THE SYSTEM SHALL mostrar la sección "Stage 1 — Formación: importaciones" con 8 casillas y la sección "Stage 2 — Formación: armá tu tienda" con 3 casillas, con los mismos títulos, descripciones y diseño de casilla que el Inicio.
- WHEN un video está publicado y tiene link THE SYSTEM SHALL mostrar su miniatura y título en la casilla.
- WHEN un video está publicado pero sin link válido THE SYSTEM SHALL mostrarlo en su casilla con su título y la etiqueta "Próximamente", igual que el usuario.
- THE SYSTEM SHALL NOT mostrar los videos despublicados dentro de las grillas ni hacer que ocupen una casilla: ni el admin ni el usuario los ven ahí, y los videos publicados siguientes suben de lugar.
- THE SYSTEM SHALL mostrar los videos despublicados de cada stage en una sección aparte "Despublicados" debajo de la grilla (visible solo para el admin), con su título, para poder abrirlos, editarlos o volver a publicarlos. [A confirmar: ver Open questions]
- WHEN una casilla no tiene video THE SYSTEM SHALL mostrarla como casilla vacía "Próximamente" con una señal de que se puede tocar para agregar uno.
- THE SYSTEM SHALL mostrar las casillas en el orden guardado (`orden`) y las vacías siempre al final de cada stage.
- IF quien abre la pantalla no es admin THEN THE SYSTEM SHALL responder como hoy (sin exponer la pantalla).

### US-2: Agregar un video desde una casilla vacía

As a administrador, I want tocar una casilla vacía para sumar un video, so that cargo contenido directamente donde va a aparecer.

**Acceptance criteria:**

- WHEN el admin toca una casilla vacía de un stage THE SYSTEM SHALL abrir un panel con el formulario de alta (título, descripción, link del video, publicado) con el stage ya fijado y sin selector de stage.
- WHEN el admin guarda un video nuevo válido THE SYSTEM SHALL crearlo al final de ese stage, cerrar el panel y mostrarlo en la primera casilla libre.
- WHEN el admin pega un link de video THE SYSTEM SHALL extraer el identificador del video al guardar, como hace hoy el formulario de contenido.
- IF falta el título o el link tiene un formato inválido THEN THE SYSTEM SHALL mostrar el error en el panel, mantener el panel abierto y SHALL NOT crear el video.
- IF el stage ya tiene todas sus casillas ocupadas THEN THE SYSTEM SHALL NOT ofrecer casillas vacías en él, ni permitir crear un video extra que quedaría oculto para el usuario.
- WHEN el video se crea o cambia THE SYSTEM SHALL revalidar el contenido como hoy, para que el Inicio del usuario se actualice.

### US-3: Editar un video desde su casilla

As a administrador, I want tocar una casilla con video para editarlo ahí mismo, so that corrijo título, link o estado sin cambiar de página.

**Acceptance criteria:**

- WHEN el admin toca una casilla con video THE SYSTEM SHALL abrir el mismo panel con los datos actuales cargados (título, descripción, link, publicado).
- WHEN el admin guarda cambios válidos THE SYSTEM SHALL actualizar el video, cerrar el panel y reflejar el cambio en la casilla sin recargar la página.
- WHEN el admin desmarca "Publicado" y guarda, o usa "Despublicar" THE SYSTEM SHALL sacar el video de la grilla, liberar su casilla y listarlo en "Despublicados", sin borrarlo de la base.
- WHEN el admin vuelve a publicar un video despublicado y su stage tiene una casilla libre THE SYSTEM SHALL agregarlo al final de la grilla de ese stage.
- IF el admin intenta publicar un video y su stage no tiene casillas libres THEN THE SYSTEM SHALL no publicarlo, conservar el panel abierto y mostrar un mensaje que explique que el stage está completo.
- IF el guardado falla (validación o error del servidor) THEN THE SYSTEM SHALL mostrar el error en el panel, conservar lo que el admin escribió y SHALL NOT cerrar el panel.
- THE SYSTEM SHALL NOT permitir cambiar el stage de un video existente desde el panel.
- WHEN el admin cierra el panel sin guardar THE SYSTEM SHALL descartar los cambios sin modificar nada.

### US-4: Reordenar arrastrando

As a administrador, I want arrastrar los videos para cambiar su orden, so that defino la secuencia de aprendizaje de forma directa.

**Acceptance criteria:**

- WHEN el admin arrastra un video y lo suelta sobre otro del mismo stage THE SYSTEM SHALL reordenarlos, mostrar el nuevo orden de inmediato y guardarlo.
- IF el admin intenta soltar un video en el otro stage THEN THE SYSTEM SHALL NOT moverlo y SHALL dejarlo en su posición original.
- THE SYSTEM SHALL NOT permitir arrastrar ni mover casillas vacías: siempre quedan al final.
- IF el guardado del orden falla THEN THE SYSTEM SHALL volver al orden anterior y mostrar un mensaje de error.
- THE SYSTEM SHALL permitir reordenar con mouse, táctil y teclado, como el listado actual.
- WHEN se reordenan los videos de un stage THE SYSTEM SHALL NOT alterar el orden de los videos del otro stage.

### US-5: Reemplazar las pantallas actuales de videos

As a administrador, I want una única pantalla para los videos, so that no tengo dos formas distintas de hacer lo mismo.

**Acceptance criteria:**

- THE SYSTEM SHALL servir en `/admin/contenido/videos` la nueva pantalla en lugar del listado actual.
- THE SYSTEM SHALL dejar de usar las páginas de alta y de edición separadas para videos (`/admin/contenido/videos/nuevo` y `/admin/contenido/videos/[id]`).
- THE SYSTEM SHALL NOT cambiar `/admin/contenido/agentes`, `/profesionales` ni `/servicios_financieros`.
- THE SYSTEM SHALL conservar el registro de auditoría de crear, editar, despublicar y reordenar, igual que hoy.

## Constraints

- Debe seguir el sistema visual "Liquid Glass" del repo: se arma con las primitivas de `components/ui/glass.module.css` y `type.module.css` por `composes`, sin redeclarar sus propiedades (CLAUDE.md).
- Debe reutilizar `VideoGrid` / `VideoCard` del Inicio (y su modo de reorden de admin) en lugar de duplicarlos.
- Debe usar la API existente (`POST /api/admin/contenido/videos`, `PATCH`/`DELETE` por id y `PUT /api/admin/contenido/videos/orden`) y el parseo de links de `lib/video/provider.ts`; sin migraciones de base de datos.
- El tamaño de las grillas lo fija `CANTIDAD_STAGE` (8 y 3) en `lib/data/videos.ts`; el editor no debe duplicar esos números.
- Hoy `obtenerVideosPorStage` toma las primeras N filas del stage por `orden` y recién después decide si cada una se muestra, así que un video despublicado ocupa casilla. Para cumplir US-1 hay que filtrar `publicado = true` **antes** de limitar a N filas (`lib/data/videos.ts`), con sus tests, y el editor debe usar la misma regla. Es el único cambio sobre lo que ve el usuario.
- Los videos ya cargados se eliminaron de la base (la tabla está vacía a la fecha), así que el editor arranca con las grillas vacías. Los ids de videos viejos pueden quedar en `profiles.progreso.videosVistos` de cuentas de prueba; el contador de progreso cuenta ids, no videos existentes.
- Rendimiento: sin sumar peso al bundle de quien no es admin (regla de `docs/RENDIMIENTO.md`); `@dnd-kit` solo se carga en el admin.
- Al ser UI nueva, se corre `/design-critique` antes de darla por terminada (CLAUDE.md).

## Open questions

- _(Resuelta)_ **Dónde se ven los despublicados:** sección "Despublicados" debajo de cada grilla, solo para el admin.
- _(Resuelta)_ **Al volver a publicar:** el video vuelve **al final** de su grilla; si no, el coach lo acomoda arrastrando.
