# Tasks: Editor de videos del admin (réplica del Inicio)

**Status:** Draft
**Last updated:** 2026-10-08
**Design:** [design.md](./design.md)

Ordered by dependency — earlier tasks unblock later ones. Check items off as they're completed during implementation so this file stays an accurate record of progress.

Convención de verificación en cada tarea con código: `biome ci` (con el código de salida real, no solo la salida) y `tsc --noEmit` sobre lo tocado. Los tests de integración corren contra la base compartida: no se lanzan en paralelo con otro CI.

## A. Base de datos y lógica (sin interfaz)

- [ ] **T1 — Extraer `CANTIDAD_STAGE` y `TOTAL_VIDEOS` a `lib/data/videos-config.ts`**
  Satisfies: Constraints (cupos sin duplicar)
  Notes: Módulo sin imports. `lib/data/videos.ts` los re-exporta para que ningún import actual cambie. Evita el ciclo `videos.ts` ↔ `admin/contenido.ts`. Sin cambio de comportamiento.

- [ ] **T2 — Los despublicados dejan de ocupar casilla en la lectura del usuario**
  Satisfies: US-1
  Depends on: T1
  Notes: En `obtenerVideosPorStage` (`lib/data/videos.ts`) agregar `.eq("publicado", true)` antes de `slice(0, cantidad)`; mantener normalización del `provider_ref` y el relleno. Tests en `lib/data/videos.test.ts` y `videos-fallback.unit.test.ts`: un despublicado no ocupa lugar, y con más publicados que el cupo se muestran solo los primeros N.

- [ ] **T3 — Cupo por stage y "volver a publicar al final" en `lib/data/admin/contenido.ts`**
  Satisfies: US-2, US-3
  Depends on: T1
  Notes: Clase `StageCompleto`. En `crearContenido` y `actualizarContenido` para `videos`: si queda publicado, contar publicados del stage (excluyendo el propio id) y lanzar `StageCompleto` si `>= CANTIDAD_STAGE[stage]`. En `actualizarContenido`, si pasa de `publicado=false` a `true`, asignar `orden = proximoOrdenVideo()`. Tests en `lib/data/admin/contenido.test.ts`: lleno → error sin escribir; despublicar libera; publicar mueve al final; crear despublicado con stage lleno es válido.

- [ ] **T4 — Mapear `StageCompleto` a HTTP 409 en las rutas de contenido**
  Satisfies: US-2, US-3
  Depends on: T3
  Notes: `app/api/admin/contenido/[entidad]/route.ts` (POST) y `.../[id]/route.ts` (PATCH). Mensaje: "El Stage N ya tiene sus M casillas ocupadas. Despublicá un video antes de publicar otro." No debe capturarse en Sentry como error inesperado. Tests en los `route.test.ts` existentes.

- [ ] **T5 — `listarVideosParaEditor(admin)`**
  Satisfies: US-1
  Depends on: T1
  Notes: Devuelve `{1:{publicados,despublicados},2:{...}}` con el tipo `VideoEditor` (incluye `thumbnailUrl` resuelta con `videoProvider`, igual que el Inicio). Publicados limitados al cupo; despublicados completos. Tests en `contenido.test.ts`.

## B. Componentes compartidos

- [ ] **T6 — Textos de sección compartidos**
  Satisfies: US-1
  Notes: `components/inicio/secciones-formacion.ts` con eyebrow, título y descripción de Stage 1 y 2; `InicioShell.tsx` pasa a leerlos. Refactor puro: el Inicio queda idéntico (verificar con `e2e/camino-aprendizaje.spec.ts`).

- [ ] **T7 — Extraer `CasillaVideo` presentacional de `VideoCard`**
  Satisfies: US-1
  Notes: `components/video/CasillaVideo.tsx` (nodo numerado, línea, contenedor), sin estado ni contexto de progreso. `VideoCard` pasa a componerla sin cambiar su aspecto ni su comportamiento. Verificar el Inicio en pantalla y con `camino-aprendizaje`. Respetar `video.module.css` (no redeclarar propiedades de las primitivas de vidrio).

- [ ] **T8 — `VideoGridReordenable` acepta `renderCard`**
  Satisfies: US-4
  Depends on: T7
  Notes: La prop decide qué se dibuja por video; el Inicio sigue pasando `VideoCard` (modo admin del `/dashboard` sin cambios de comportamiento).

- [ ] **T9 — `useBodyScrollLock` (contador compartido)**
  Satisfies: Constraints (scroll del body)
  Notes: `components/ui/useBodyScrollLock.ts`: bloquea al primer uso y libera cuando se cierra el último. Test del hook (dos usos solapados, cierre en distinto orden). Solo lo usa el panel nuevo; migrar `NavDrawer`, `CerrarSesionBoton` y `DatosModal` queda como seguimiento aparte.

## C. Interfaz del editor

- [ ] **T10 — `VideoPanel` (modal de alta/edición)**
  Satisfies: US-2, US-3
  Depends on: T4, T9
  Notes: `app/admin/contenido/[entidad]/VideoPanel.tsx`. Campos: título, descripción, link, publicado (en alta arranca sin publicar); sin selector de stage; en edición no envía `stage`. Muestra `fieldErrors` (400) y el mensaje del 409 sin cerrar. Botón "Despublicar" en edición de un video publicado (`PATCH publicado:false`). Accesibilidad: `role="dialog"`, `aria-modal`, foco inicial, trampa de foco y Escape (mismo patrón que `DatosModal`).

- [ ] **T11 — `VideosEditor` + grilla por stage con casillas tocables**
  Satisfies: US-1, US-2, US-3, US-4
  Depends on: T5, T6, T8, T10
  Notes: `VideosEditor.tsx` (cliente) con estado por stage, y un `DndContext` por stage (imposible soltar en el otro). Casillas vacías = `cupo − publicados`, tocables y no sortables. Sección "Despublicados" bajo cada grilla. Al guardar, actualizar el estado con la fila devuelta por la API (sin `router.refresh()`). Reordenar: optimista, `PUT .../videos/orden` con los ids del stage, rollback si falla. Cargar `@dnd-kit` con `lazy`/`dynamic` (regla 8 de `docs/RENDIMIENTO.md`).

- [ ] **T12 — Cablear `/admin/contenido/videos` y retirar el listado viejo**
  Satisfies: US-5
  Depends on: T11
  Notes: En `app/admin/contenido/[entidad]/page.tsx`, para `videos` renderizar el editor con `listarVideosParaEditor`; sacar el botón "+ Crear nuevo" y el texto "arrastrá para reordenar" para videos. Borrar `VideosReordenables.tsx` y `VideosReordenablesLazy.tsx`. **No** tocar `nuevo/page.tsx`, `[id]/page.tsx` ni `ContenidoForm.tsx` (Stage 3).

## D. Tests de extremo a extremo y cierre

- [ ] **T13 — Reescribir `e2e/admin-edita-video-revalida.spec.ts`**
  Satisfies: US-2, US-3, US-5
  Depends on: T12
  Notes: Hoy usa `/videos/nuevo` y `/videos/[id]`. Pasa a crear tocando una casilla vacía, editar desde el panel y comprobar que el Inicio del usuario se actualiza. Crear los videos de prueba **sin publicar** salvo lo imprescindible, y limpiar al terminar (cupo + base compartida). Revisar que `camino-aprendizaje.spec.ts` y `plataforma-bloqueada.spec.ts` no dependan de los videos que ya se borraron.

- [ ] **T14 — Verificación final y PR**
  Satisfies: todos
  Depends on: T1–T13
  Notes: `biome ci .` (código de salida 0), `tsc --noEmit`, suite de tests una sola vez sin otro CI en paralelo. Revisar en pantalla con sesión de admin: editor y Inicio del usuario. Correr `/design-critique` sobre la pantalla nueva (CLAUDE.md). Abrir PR contra `main`; mergear de a uno esperando el CI.
