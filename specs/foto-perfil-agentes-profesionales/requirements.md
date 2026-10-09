# Requirements: Foto de perfil para agentes de compra y profesionales

**Status:** Approved (2026-10-08)
**Last updated:** 2026-10-08

## Summary

El admin puede cargar, reencuadrar, reemplazar y quitar una foto de perfil de cada agente de compra en China y de cada profesional al servicio, como parte del CRUD de las tablas `agentes` y `profesionales`. La foto se acomoda (zoom + arrastre) en un recorte cuadrado antes de guardarse, y se muestra a los usuarios en las tarjetas del directorio en lugar del círculo de iniciales.

## Goals

- La foto es un campo más del alta y la edición de agentes y profesionales (`/admin/contenido/agentes` y `/admin/contenido/profesionales`).
- El admin encuadra la foto antes de guardarla definitivamente; lo que ve en el recorte es lo que se guarda.
- La subida está validada (tipo real, tamaño, dimensiones) tanto en el cliente como en el servidor.
- Los usuarios con acceso a la plataforma ven la foto en las tarjetas; sin foto se sigue viendo el círculo con iniciales.
- Se mantiene la auditoría del admin (`admin_audit_log`) para los cambios de foto.

## Non-goals

- Fotos para `videos` y `servicios_financieros`.
- Galería o varias fotos por registro.
- Recorte con proporciones distintas a 1:1, rotación libre o filtros.
- Subida de fotos por parte de usuarios finales o de los propios agentes/profesionales.
- Migrar o cargar fotos reales en bloque (la carga la hace el admin a mano).
- Ocultar la foto según el plan del usuario: la foto es parte de los datos públicos de la tarjeta, no del contacto sensible.

## User stories

### US-1: Cargar y encuadrar una foto

As a admin, I want elegir una imagen y acomodarla en un recorte cuadrado antes de guardar, so that la foto se vea bien en la tarjeta.

**Acceptance criteria** (EARS format):

- WHEN el admin elige un archivo en el formulario de agente o profesional THE SYSTEM SHALL abrir un editor de recorte 1:1 con zoom y arrastre, con vista previa circular igual a la de las tarjetas.
- WHEN el admin confirma el recorte THE SYSTEM SHALL mostrar la foto recortada en el formulario sin haberla guardado todavía en el servidor.
- WHEN el admin cancela el editor THE SYSTEM SHALL descartar el archivo elegido y conservar la foto anterior (si había).
- WHEN el admin guarda el formulario con una foto nueva THE SYSTEM SHALL guardar el recorte final (no el original) y asociarlo al registro.
- IF el admin cierra o abandona el formulario sin guardar THEN THE SYSTEM SHALL NOT dejar ninguna foto nueva asociada al registro.

### US-2: Validar la imagen

As a admin, I want que el sistema rechace imágenes inválidas con un mensaje claro, so that no se suba contenido roto o peligroso.

**Acceptance criteria:**

- THE SYSTEM SHALL aceptar solo JPG, PNG y WebP, de hasta 5 MB.
- IF el archivo supera 5 MB THEN THE SYSTEM SHALL rechazarlo y mostrar el límite en el mensaje.
- IF el tipo real del archivo (por su contenido, no por su extensión ni su `Content-Type` declarado) no es JPG, PNG o WebP THEN THE SYSTEM SHALL rechazarlo en el servidor.
- IF la imagen no se puede decodificar o es menor a 256×256 px THEN THE SYSTEM SHALL rechazarla y avisar la resolución mínima.
- THE SYSTEM SHALL aplicar las mismas validaciones en el servidor aunque el cliente ya las haya hecho.
- THE SYSTEM SHALL guardar la foto reducida a un tamaño fijo (512×512 px, WebP), sin metadatos EXIF.

### US-3: Reemplazar o quitar la foto

As a admin, I want cambiar o borrar la foto de un registro existente, so that el directorio esté siempre actualizado.

**Acceptance criteria:**

- WHEN el admin edita un registro con foto THE SYSTEM SHALL mostrar la foto actual y permitir reemplazarla, reencuadrarla o quitarla.
- WHEN el admin reemplaza la foto y guarda THE SYSTEM SHALL mostrar la nueva en el directorio y eliminar el archivo anterior del Storage.
- WHEN el admin quita la foto y guarda THE SYSTEM SHALL dejar el registro sin foto y eliminar el archivo del Storage.
- WHEN el admin borra un agente o profesional THE SYSTEM SHALL eliminar también su foto del Storage.
- IF el reemplazo o la subida falla a mitad de camino THEN THE SYSTEM SHALL conservar la foto anterior y mostrar un error, sin dejar el registro apuntando a un archivo inexistente.

### US-4: Ver la foto en el directorio

As a usuario de la plataforma, I want ver la foto de cada agente y profesional, so that pueda reconocerlos y confiar más en el directorio.

**Acceptance criteria:**

- WHEN un agente o profesional tiene foto THE SYSTEM SHALL mostrarla en su tarjeta, recortada en círculo, en lugar de las iniciales.
- WHEN no tiene foto THE SYSTEM SHALL mostrar el círculo con iniciales como hoy.
- WHILE el usuario no tiene el plan activo THE SYSTEM SHALL seguir aplicando el gating actual al contacto; la foto no cambia qué datos quedan bloqueados.
- IF la foto no carga THEN THE SYSTEM SHALL caer al círculo con iniciales.
- THE SYSTEM SHALL servir la foto sin degradar el rendimiento medido en `docs/RENDIMIENTO.md` (dimensiones declaradas, carga diferida).

### US-5: Seguridad y permisos

As a equipo, I want que solo un admin pueda modificar fotos, so that el directorio no se pueda alterar desde afuera.

**Acceptance criteria:**

- IF un usuario no admin intenta subir, reemplazar o borrar una foto THEN THE SYSTEM SHALL rechazar la operación con 401/403.
- THE SYSTEM SHALL NOT exponer escritura sobre el bucket a `anon` ni `authenticated`; las escrituras pasan solo por el servidor.
- WHEN el admin crea, cambia o quita una foto THE SYSTEM SHALL registrarlo en `admin_audit_log`, consistente con el resto de los cambios de contenido.

## Constraints

- Stack existente: Next.js 15 (App Router), Supabase (Postgres + Storage), sin ORM; el CRUD genérico vive en `app/admin/contenido/[entidad]/ContenidoForm.tsx`, `lib/data/admin/contenido.ts` y `/api/admin/contenido/:entidad`.
- Requiere una migración de Supabase (columna de foto en `agentes` y `profesionales` y bucket de Storage). Seguir el patrón de grants + RLS de las migraciones existentes.
- `agentes.contacto` y `profesionales.contacto` siguen siendo el único dato sensible; la ruta de la foto no debe filtrar nada sensible.
- UI según el sistema "Liquid Glass" (`DESIGN.md`) y las primitivas de `components/ui/`; textos en español rioplatense.
- Hay que correr `/design-critique` sobre la UI nueva antes de dar la feature por terminada (CLAUDE.md).
- La librería de recorte es una dependencia nueva del bundle de cliente: el costo se mide según `docs/RENDIMIENTO.md` y se carga solo en el admin.

## Open questions

- Ninguna bloqueante. Quedan para la fase de diseño: bucket público vs. URLs firmadas, librería de recorte, y si el procesamiento (resize/WebP) se hace en el cliente, en el servidor o en ambos.
