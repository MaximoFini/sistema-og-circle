# Requirements: Página de Formación + Materiales adicionales

**Status:** Approved (2026-10-09)
**Last updated:** 2026-10-09

## Summary

La formación en video (Stage 1 importaciones y Stage 2, que pasa de 3 a ~15 videos de tienda online) se muda de Inicio a una página propia, `/formacion`, que además suma una card **"Materiales adicionales"** con archivos descargables (PDF, PowerPoint, Excel, Word) que el admin sube y gestiona desde el panel.

## Goals

- Que Stage 2 pueda crecer a ~15 videos (o más) sin romper el layout de Inicio.
- Que la formación tenga un único lugar: `/formacion`, con los dos stages y los materiales.
- Que Inicio siga mostrando dónde quedó el usuario y lo lleve en un click al próximo video.
- Que el admin pueda subir, editar, reemplazar, publicar/ocultar, reordenar y borrar materiales sin intervención de un dev.
- Que el contador de progreso refleje solo los videos que existen de verdad.

## Non-goals

- **Rediseño de la grilla de videos o del modo de visualización.** `/formacion` reutiliza `VideoGrid` / `VideoCard` tal como están hoy: un camino numerado donde el reproductor se despliega en la misma fila al tocar la miniatura. No hay modal.
- **Agrupar Stage 2 en módulos o capítulos.** Los 15 van uno después de otro, en el orden que define el admin.
- **Atar materiales a un stage o a un video.** Los materiales son una sección independiente.
- **Registrar descargas, badge "Nuevo" o previsualizar PDF en el navegador.** Se descartaron para esta iteración.
- **Archivos de más de 50 MB y subida resumible.**
- **Mover el video explicativo de agentes (stage 3).** Sigue en Inicio, en la sección de Agentes, y no cuenta para el progreso.
- **Avisar a los usuarios (email o notificación) cuando se publica un video o material nuevo.** Queda para una feature aparte.
- **Previsualizar en `/formacion` el contenido oculto.** Lo oculto solo se ve en el panel admin, y `/formacion` se ve igual para todos.
- **"Continuar" según el último video visto.** El criterio es el primer video sin ver en el orden del curso, así que no hace falta guardar cuándo se vio cada uno.
- **Filtros por tipo de archivo en Materiales.**

## User stories

### US-1: Ver la formación completa en /formacion

Como usuario con plan, quiero una página de Formación con Stage 1 y Stage 2, para recorrer todos los videos sin scrollear por el resto de Inicio.

**Acceptance criteria:**

- THE SYSTEM SHALL servir la ruta `/formacion` dentro del layout autenticado de la app.
- THE SYSTEM SHALL mostrar en `/formacion`, en este orden: la sección Stage 1 ("Formación: importaciones"), la sección Stage 2 ("Formación: armá tu tienda") y, abajo de ambas y a ancho completo, la card "Materiales adicionales" (también en desktop, sin columna lateral).
- THE SYSTEM SHALL renderizar cada stage con el mismo camino (`VideoGrid` / `VideoCard`) y la misma reproducción desplegada en la fila que hoy usa Inicio.
- THE SYSTEM SHALL ordenar los videos de cada stage por el campo `orden` que define el admin.
- THE SYSTEM SHALL mostrar en cada stage solo los videos publicados y con video válido, sin tiles de relleno "Próximamente".
- IF un stage no tiene ningún video publicado THEN THE SYSTEM SHALL mostrar un estado vacío con un texto del tipo "Los videos de este stage están en camino", en vez de una grilla vacía.
- WHEN el usuario termina o marca como visto un video en `/formacion` THE SYSTEM SHALL registrar el progreso con el mismo mecanismo que hoy (`marcarVideoVisto`).
- WHILE el usuario es admin THE SYSTEM SHALL permitir reordenar los videos de cada stage por arrastre dentro de `/formacion`, igual que hoy en Inicio (el arrastre se muda de Inicio a `/formacion`). El reorden del panel admin se mantiene y ambos escriben el mismo `orden`.

### US-2: Stages sin tope de videos

Como admin, quiero cargar los videos que hagan falta en cada stage (~15 en Stage 2), para publicar el curso completo sin que un video quede oculto por un límite fijo.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar todos los videos publicados de cada stage, sin tope de cantidad. Se elimina `CANTIDAD_STAGE` como límite de Stage 1 y 2.
- WHEN el admin publica un video nuevo en Stage 2 THE SYSTEM SHALL mostrarlo en `/formacion` sin redeploy (revalidación existente sobre `videos`).

### US-3: Progreso basado en videos publicados

Como usuario, quiero que el contador diga cuántos videos vi sobre los que existen, para que el número no mienta mientras se siguen grabando videos.

**Acceptance criteria:**

- THE SYSTEM SHALL mantener el contador global en el header de Inicio (vistos / publicados de Stage 1 + Stage 2), además del progreso de cada tarjeta por stage.
- THE SYSTEM SHALL calcular el total del contador como la cantidad de videos publicados de Stage 1 más los de Stage 2. Stage 3 no cuenta.
- THE SYSTEM SHALL calcular "vistos" contando solo los videos que siguen publicados.
- WHEN el admin publica o despublica un video THE SYSTEM SHALL reflejar el nuevo total en el próximo render (revalidación existente).

### US-4: Resumen y "Continuar" en Inicio

Como usuario con plan, quiero ver en Inicio mi avance por stage y retomar el próximo video en un click, para no tener que buscar dónde quedé.

**Acceptance criteria:**

- THE SYSTEM SHALL reemplazar en Inicio las grillas de Stage 1 y Stage 2 por una tarjeta resumen por stage, con título del stage, progreso (vistos / publicados) y la miniatura y el título del próximo video, que es el **primer** video publicado no visto según `orden`. Ejemplo: si vio 1, 2 y 5, le propone el 3.
- WHEN el usuario toca "Continuar" en una tarjeta THE SYSTEM SHALL navegar a `/formacion` con el video en la URL (ej. `/formacion?video=<id>`), desplegar el reproductor de ese video y hacer scroll hasta él.
- IF el usuario vio todos los videos publicados de un stage THEN THE SYSTEM SHALL mostrar la tarjeta como completada, con un link "Ver de nuevo" a `/formacion`, sin botón Continuar.
- IF un stage no tiene videos publicados THEN THE SYSTEM SHALL mostrar la tarjeta con estado "Próximamente" y sin botón Continuar.
- THE SYSTEM SHALL incluir en Inicio un link "Ver toda la formación" a `/formacion`.
- IF `/formacion` se abre con un video que no existe, no está publicado o no es reproducible para ese usuario THEN THE SYSTEM SHALL mostrar la página normalmente sin desplegar ningún video.

### US-5: Descargar materiales adicionales

Como usuario con plan, quiero descargar los materiales de apoyo (PDF, PPT, Excel, Word), para usarlos fuera de la plataforma.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar en `/formacion` una card "Materiales adicionales" con una fila por material publicado, ordenadas por el orden que define el admin.
- IF hay más de 6 materiales publicados THEN THE SYSTEM SHALL mostrar los primeros 6 y un botón "Ver todos (N)" que expande la lista en el lugar, sin navegar, y un "Ver menos" para volver a colapsarla.
- THE SYSTEM SHALL mostrar en cada fila un ícono según el tipo (PDF / PowerPoint / Excel / Word), el título, la descripción si existe, el tipo y el tamaño legible (ej. "PDF · 2,3 MB") y un botón "Descargar".
- WHEN el usuario con plan toca "Descargar" THE SYSTEM SHALL iniciar la descarga del archivo con el **título del material** como nombre, más la extensión original (ej. "Checklist de importación.pdf"). Se sacan los caracteres inválidos para nombres de archivo.
- THE SYSTEM SHALL NOT exponer en el HTML una URL permanente del archivo. La URL de descarga se genera en el momento, verificando el plan, y vence en pocos minutos.
- IF no hay materiales publicados THEN THE SYSTEM SHALL mostrar la card con un estado vacío ("Todavía no hay materiales cargados").
- IF la generación del link de descarga falla THEN THE SYSTEM SHALL mostrar un mensaje de error en la fila, sin romper la página.

### US-6: Usuario sin plan en /formacion

Como usuario sin plan, quiero ver qué incluye la formación aunque esté bloqueada, para saber qué desbloqueo si compro.

**Acceptance criteria:**

- WHILE el usuario no tiene plan activo THE SYSTEM SHALL mostrar en `/formacion` los títulos y miniaturas de los videos y la lista de materiales (título, tipo, tamaño), con el mismo patrón bloqueado de Inicio: el contenido con blur y la `TarjetaDesbloqueo` encima, que cobra directo (VGRP-78). Los botones de reproducir y descargar quedan inertes.
- WHILE el usuario no tiene plan activo THE SYSTEM SHALL NOT enviar al cliente URLs de embed de videos y SHALL NOT generar URLs de descarga de materiales.
- IF un usuario sin plan invoca la acción de descarga directamente THEN THE SYSTEM SHALL rechazarla del lado del servidor.

### US-7: Admin gestiona materiales desde el panel

Como admin, quiero administrar los materiales adicionales desde el panel, para mantener la biblioteca actualizada sin tocar código.

**Acceptance criteria:**

- THE SYSTEM SHALL agregar "Materiales adicionales" como entidad en el índice de Contenido del panel admin.
- WHEN el admin sube un archivo con título (obligatorio) y descripción (opcional) THE SYSTEM SHALL guardarlo y crear el material **publicado**, al final del orden, visible en `/formacion` sin redeploy.
- IF el archivo no es PDF, PPT/PPTX, XLS/XLSX/CSV o DOC/DOCX THEN THE SYSTEM SHALL rechazarlo con un mensaje claro, tanto en el cliente como en el servidor.
- IF el archivo pesa más de 50 MB THEN THE SYSTEM SHALL rechazarlo **antes de empezar a subirlo**, con un mensaje que indique el límite.
- WHILE un archivo se está subiendo THE SYSTEM SHALL mostrar una barra con el porcentaje real de progreso y un botón "Cancelar", y SHALL deshabilitar el guardado.
- WHEN el admin cancela la subida o la subida falla (conexión, error del servidor) THE SYSTEM SHALL avisar con un mensaje, SHALL NOT crear el material (o, en un reemplazo, SHALL conservar el archivo anterior) y SHALL NOT dejar archivos huérfanos en Storage.
- WHEN el admin edita título o descripción THE SYSTEM SHALL guardar los cambios sin tocar el archivo.
- WHEN el admin reemplaza el archivo de un material THE SYSTEM SHALL guardar el nuevo archivo, actualizar tipo y tamaño, eliminar el archivo anterior y conservar título, descripción, orden y estado de publicación.
- WHEN el admin cambia el estado publicado/oculto THE SYSTEM SHALL mostrar u ocultar el material en `/formacion` sin redeploy. Los materiales ocultos se siguen viendo en el listado del panel con la etiqueta "Oculto".
- WHEN el admin reordena los materiales **arrastrando** en el listado del panel (mismo componente y accesibilidad que el reorden de videos: mouse, táctil y teclado) THE SYSTEM SHALL persistir el nuevo orden y reflejarlo en `/formacion`.
- WHEN el admin borra un material THE SYSTEM SHALL pedir confirmación y, al confirmar, eliminar el registro y su archivo.
- THE SYSTEM SHALL mostrar en el listado de materiales del panel el espacio usado (suma de los tamaños de todos los materiales, publicados u ocultos) contra el límite de 1 GB del plan Free de Supabase, ej. "Espacio usado: 312 MB de 1 GB". Agregado en diseño, por estar en plan Free.
- IF el espacio usado supera el 80 % THEN THE SYSTEM SHALL mostrar ese indicador como advertencia.
- THE SYSTEM SHALL registrar cada alta, edición, reemplazo, cambio de publicación, reorden y baja en el log de auditoría existente.
- IF un usuario no admin intenta cualquiera de estas acciones THEN THE SYSTEM SHALL rechazarla del lado del servidor.

### US-8: Navegación

Como usuario, quiero llegar a Formación desde el menú, para entrar directo sin pasar por Inicio.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar una entrada "Formación" en el menú de navegación (`NavDrawer`), **justo después de Inicio**, que lleva a `/formacion` y se marca como activa cuando el usuario está ahí. Se muestra también a usuarios sin plan.

## Constraints

- Sistema visual "Liquid Glass": se componen las primitivas de `glass.module.css` / `type.module.css` sin redeclarar propiedades (CLAUDE.md, DESIGN.md).
- Reglas de rendimiento de `docs/RENDIMIENTO.md`. Hoy Inicio es una ruta estática con caché por tag, y `/formacion` debe seguir el mismo criterio, con fallback si la base no responde en build (VGRP-53).
- El contenido bloqueado se muestra con explicación, no se oculta (MODULOS.md §2). Se cumple con blur y `TarjetaDesbloqueo`.
- La subida no puede pasar por el body de una Server Action, porque Next limita ese body a ~1 MB por defecto: el archivo tiene que ir directo a Storage (por ejemplo, con una URL de subida firmada). Se define en diseño.
- Los archivos viven en Supabase Storage. El plan Free tiene un límite de 50 MB por archivo, y el bucket de materiales tiene que ser **privado**: a diferencia de `fotos-directorio` (spec `foto-perfil-agentes-profesionales`), el contenido es pago.
- Se tienen que actualizar los tests que hoy fijan `CANTIDAD_STAGE` (8/3/1) y `TOTAL_VIDEOS = 11`, los e2e `camino-aprendizaje` y `admin-edita-video-revalida`, y las menciones a "3 videos" y "X / 11" en CONTEXT.md y MODULOS.md.

## Open questions

- Ninguna bloqueante. A resolver en diseño: si `/formacion` se resuelve como ruta estática con variantes (igual que `dashboard/[variante]`) o dinámica, y el mecanismo exacto de la URL de descarga firmada.
