# Tasks: Foto de perfil para agentes de compra y profesionales

**Status:** In progress (T1–T14 hechas; T15–T16 pendientes)
**Last updated:** 2026-10-09
**Design:** [design.md](./design.md)

Ordenadas por dependencia: las primeras desbloquean a las siguientes. Se tilda cada una al terminarla para que este archivo sea el registro real del avance. Los tests van junto a la tarea que verifican.

## Desvíos respecto del plan (decididos durante la implementación)

- **Componentes del editor** en `app/admin/contenido/[entidad]/` (`CampoFoto.tsx`, `RecorteFotoModal.tsx`, `foto.module.css`), no en `components/admin/` (no existe esa carpeta; los componentes del admin viven junto a su pantalla, como `VideoPanel.tsx`).
- **Mutaciones en `lib/fotos/mutaciones.ts`** (`leerFoto`, `cambiarFoto`, `quitarFoto`) para que la ruta quede fina y la lógica se pruebe aparte, igual que `lib/data/admin/contenido.ts`.
- **El audit log guarda también `nombre`** (`{ nombre, foto_path }`) para que la pantalla de Auditoría diga "Cambió la foto del agente “Pepe”" en vez de no poder nombrar el ítem.
- **Reintento de la foto (T14):** si el registro se guardó y la foto falló, el form se queda en la página, recuerda el `id` creado y el próximo "Guardar cambios" hace PATCH (no crea un duplicado) y reintenta la foto. No hace falta un botón "Reintentar foto" aparte.
- **`Avatar` sin `sizes`:** con ancho fijo Next arma un `srcset` 1x/2x (48/96 px); con `sizes` generaba los 16 anchos del config (16…3840). Detectado en la prueba en navegador.
- **`iniciales.ts` se movió a `components/ui/`** (ahora lo usa la primitiva `Avatar`) y `.iniciales` salió de `inicio.module.css`.
- **Sin test unitario de `Avatar`:** Vitest corre en Node sin DOM ni testing-library; lo cubre la prueba en navegador (y el e2e de T14 cuando se escriba).

## A. Base de datos y tipos

- [x] **T1 — Aplicar la migración en Supabase (manual)** — aplicada por el usuario; verificada por API (bucket público, 2 MB, `image/webp`; columnas en las 2 tablas).
  Satisfies: US-3, US-5
  Notes: el SQL está en `supabase/migrations/20261009120000_foto_directorio.sql`. Lo ejecuta el usuario a mano en el SQL Editor (el MCP de Supabase no está autenticado) y confirma las 3 queries de verificación (2 columnas, bucket público con 2 MB / `image/webp`, 0 policies sobre `storage.objects`). Bloquea las pruebas contra la base real (T5, T8, T14), no la escritura de código.

- [x] **T2 — Agregar `foto_path` a los tipos de Supabase**
  Satisfies: US-3, US-4
  Depends on: T1
  Notes: editar `lib/database.types.ts` a mano: `foto_path: string | null` en `Row`, `Insert?` y `Update?` de `agentes` y `profesionales`.

## B. Procesado y Storage (servidor)

- [x] **T3 — Agregar `sharp` como dependencia explícita**
  Satisfies: US-2
  Notes: `pnpm add sharp`. Ya está en el árbol de Next (0.34.x); fijarlo en `package.json` para el runtime `nodejs`. Verificar que `pnpm build` no cambia el First Load JS (solo se usa en servidor).

- [x] **T4 — Crear `lib/fotos/procesar.ts` con `procesarFoto(buffer)`**
  Satisfies: US-2
  Depends on: T3
  Notes: `import "server-only"`. Constantes exportadas: `FOTO_MAX_BYTES = 2 MB`, `FOTO_MIN_PX = 256`, `FOTO_SALIDA_PX = 512`. Flujo: rechaza si supera el tope; `sharp(buffer).metadata()` y exige formato real `jpeg|png|webp` (ignora extensión y `Content-Type`); exige ≥256×256; `rotate()` por EXIF, recorte cuadrado centrado, `resize(512,512)`, salida WebP sin metadatos. Lanza un error tipado `FotoInvalida` con mensaje en español para cada caso.
  Tests (`lib/fotos/procesar.test.ts`, unitarios con imágenes generadas con sharp): JPG/PNG/WebP válidos → WebP 512×512; archivo de texto renombrado `.jpg` → rechazo; GIF/SVG → rechazo; imagen de 100×100 → rechazo; no cuadrada → recortada a cuadrado; buffer >2 MB → rechazo; el resultado no contiene EXIF.

- [x] **T5 — Crear `lib/fotos/storage.ts`**
  Satisfies: US-3, US-4, US-5
  Depends on: T1, T2
  Notes: `import "server-only"`; el cliente `AdminClient` se inyecta (mismo patrón que `lib/data/admin/contenido.ts`). Funciones: `subirFoto(admin, entidad, id, webp): Promise<string>` (ruta `<entidad>/<id>/<uuid>.webp`, `contentType: image/webp`, `upsert: false`), `borrarFoto(admin, path)` (best-effort: devuelve boolean, falla → `Sentry.captureException`), `urlPublicaFoto(path | null): string | null` (arma la URL con `NEXT_PUBLIC_SUPABASE_URL`, sin llamar a la red). Nombre del bucket como constante única.
  Tests (integración, `test/integration/fotos-storage.test.ts`, contra la base real con limpieza en `test/helpers/cleanup.ts`): sube y lee por URL pública; `authenticated`/`anon` no pueden escribir en el bucket; borrar un path inexistente no lanza.

## C. Endpoint de foto

- [x] **T6 — Crear `PUT /api/admin/contenido/[entidad]/[id]/foto`**
  Satisfies: US-1, US-2, US-3, US-5
  Depends on: T4, T5
  Notes: archivo `app/api/admin/contenido/[entidad]/[id]/foto/route.ts`, `runtime = "nodejs"`, `dynamic = "force-dynamic"`. Orden: `requireAdmin()` primero → entidad solo `agentes|profesionales` (si no 400) → `id` uuid (si no 404) → leer `multipart` campo `foto` (400 si falta o >2 MB) → `procesarFoto` (`FotoInvalida` → 400) → verificar que la fila existe (404 sin audit) → `subirFoto` → `UPDATE foto_path` → `borrarFoto` del path anterior (best-effort). Todo dentro de `conAuditoria` con acción `cambiar_foto_contenido` (valorAnterior/valorNuevo = `{ foto_path }`). Después `revalidateTag(TAG_POR_ENTIDAD[entidad])`. Respuesta `200 { fotoUrl }`. Si falla el UPDATE tras subir, borrar el objeto recién subido para no dejar basura.
  Tests (`route.test.ts` junto a la ruta, con el mismo estilo que `[id]/route.test.ts`): sin sesión 401; no admin 404 sin tocar nada; `videos` como entidad 400; id no uuid 404; sin archivo 400; archivo no imagen 400; ok → 200, `foto_path` guardado, objeto en Storage, fila de audit, tag revalidado; reemplazo → el objeto viejo ya no existe y el nuevo sí; falla simulada del UPDATE → la fila conserva la foto anterior.

- [x] **T7 — Crear `DELETE` en la misma ruta (quitar foto)**
  Satisfies: US-3, US-5
  Depends on: T6
  Notes: mismo guard y validación de ruta. `UPDATE foto_path = null` y luego `borrarFoto`. Idempotente (sin foto previa → 200 sin audit). Audit `quitar_foto_contenido`. `revalidateTag`.
  Tests: quitar con foto → fila en null, objeto borrado, audit; quitar sin foto → 200; no admin → 404.

- [x] **T8 — Limpiar la foto al borrar el registro**
  Satisfies: US-3
  Depends on: T5
  Notes: en `borrarContenido()` (`lib/data/admin/contenido.ts`), para `agentes` y `profesionales`: después del `DELETE` de la fila, `borrarFoto(admin, anterior.foto_path)` si existe. Si falla el borrado del objeto, no revertir la fila (queda en Sentry). No tocar `videos`/`servicios_financieros`. Confirmar que `foto_path` NO entra en los schemas Zod de `crear/actualizarContenido` (un `PATCH` con `foto_path` se ignora).
  Tests (ampliar `test/integration/admin-contenido.test.ts`): borrar agente con foto → objeto eliminado; `PATCH` con `foto_path` arbitrario → no cambia la columna.

- [x] **T9 — Textos de auditoría para las 2 acciones nuevas**
  Satisfies: US-5
  Depends on: T6
  Notes: `app/admin/auditoria/describir.ts`: casos `cambiar_foto_contenido` ("Cambió la foto de …") y `quitar_foto_contenido` ("Quitó la foto de …") usando `OBJETOS`/`nombreItem`. Evitar que el detalle muestre rutas crudas.
  Tests: ampliar `describir.test.ts`.

## D. Lectura pública

- [x] **T10 — Exponer `fotoUrl` en `lib/data/agentes.ts` y `lib/data/profesionales.ts`**
  Satisfies: US-4
  Depends on: T2, T5
  Notes: agregar `foto_path` al `select` y a `AgenteFila`/`ProfesionalFila`; `publicMeta.fotoUrl: string | null` vía `urlPublicaFoto`. Va dentro de la lectura cacheada (dato no sensible). No tocar `resolverSecreto()` ni el gating de `contacto`. Revisar `lib/data/cache-fallback.ts` si tiene datos de respaldo con la forma vieja.
  Tests: ampliar `lib/data/profesionales.test.ts` y `test/integration/agentes-route.test.ts` — con foto → URL; sin foto → `null`; el bloqueo de `contacto` sigue idéntico; el canario de nivel (`e2e/canario-agentes-nivel.spec.ts`) no cambia.

- [x] **T11 — Componente `Avatar` y uso en las grillas**
  Satisfies: US-4
  Depends on: T10
  Notes: `components/ui/Avatar.tsx` (+ `Avatar.module.css`, exportar en `components/ui/index.ts`): props `nombre`, `fotoUrl`, `size` (default 40). Con foto: `next/image` con `width/height` declarados, `loading="lazy"`, `sizes` fijo, dentro del círculo actual; `onError` → iniciales (estado local). Sin foto: el círculo de iniciales de hoy (reusar `iniciales()` y los estilos de `.iniciales` sin redeclarar propiedades de primitivas, regla de `CLAUDE.md`). Reemplazar el `<span className={styles.iniciales}>` en `AgentesGrid.tsx` y `ProfesionalesGrid.tsx`; mantener el `<span>` (no `<div>`) que exige `e2e/gating-contenido.spec.ts`. `next.config.ts`: `images.remotePatterns` con el host de `NEXT_PUBLIC_SUPABASE_URL` y `pathname: /storage/v1/object/public/fotos-directorio/**`.
  Tests: unitario del Avatar (foto/sin foto/error); ajustar los e2e que busquen las iniciales si hace falta.

## E. Editor de recorte (admin)

- [x] **T12 — Utilidad de recorte y validación de cliente**
  Satisfies: US-1, US-2
  Notes: `lib/fotos/cliente.ts`: `validarArchivoFoto(file)` (JPG/PNG/WebP por `file.type` + firma de los primeros bytes, ≤5 MB, mensajes en español), `leerDimensiones(file)` (≥256×256), `recortarAFoto(imagenSrc, areaPixeles): Promise<Blob>` (canvas 512×512, `image/webp` calidad 0.85; el re-dibujado descarta EXIF). Constantes compartidas con T4 (`FOTO_MIN_PX`, `FOTO_SALIDA_PX`) sin importar `sharp` en el cliente: moverlas a `lib/fotos/constantes.ts`.
  Tests (vitest con entorno apropiado o funciones puras): validación por tipo, tamaño y firma.

- [x] **T13 — Componente `FotoEditor` (cliente, carga diferida)**
  Satisfies: US-1, US-3
  Depends on: T12
  Notes: `pnpm add react-easy-crop`. `components/admin/FotoEditor.tsx`: botón "Elegir foto", modal con `Cropper` (`aspect=1`, `cropShape="round"`, zoom por slider/rueda/pinch, arrastre), botones "Usar esta foto" y "Cancelar" (descarta el archivo y conserva la foto anterior). Expone `onChange({ blob, previewUrl } | { quitar: true } | null)`. Muestra la foto actual si existe, con "Cambiar" y "Quitar". Cargar el modal y la librería con `next/dynamic` (`ssr: false`) para que no entren en ningún bundle fuera del admin. `URL.revokeObjectURL` al cerrar. Accesible: foco en el modal, `Esc` cierra, textos en español rioplatense; estilos con las primitivas Liquid Glass (`DESIGN.md`).

- [x] **T14 — Integrar `FotoEditor` en `ContenidoForm` (flujo en dos pasos)** — probado a mano en el navegador (alta con recorte → foto en Inicio → validaciones de cliente → quitar). El e2e `e2e/admin-foto-directorio.spec.ts` está escrito pero **todavía no se corrió**.
  Satisfies: US-1, US-3
  Depends on: T6, T7, T13
  Notes: `app/admin/contenido/[entidad]/ContenidoForm.tsx` y `[id]/page.tsx`. Solo para `agentes` y `profesionales` (nuevo tipo de campo `foto` en `CAMPOS`, no se manda en el JSON). En `onSubmit`: guardar el registro como hoy; si hay foto nueva → `PUT /foto` con `FormData`; si el admin marcó "Quitar" → `DELETE /foto`; recién entonces `router.push` al listado. Si el registro se guardó pero la foto falló: en alta, `router.replace` a `/admin/contenido/<entidad>/<id>` conservando el recorte en memoria no es posible entre páginas, así que se muestra el error con botón "Reintentar foto" sobre el `id` ya creado sin navegar; el mensaje dice que el ítem sí se guardó. Pasar la `fotoUrl` actual desde la página de edición (`urlPublicaFoto(item.foto_path)`). Abandonar sin guardar no deja nada en el servidor.
  Tests (e2e Playwright `e2e/admin-foto-directorio.spec.ts`): admin crea un agente con foto recortada → aparece en `/inicio` (sin sesión de plan, se ve la foto); edita y reemplaza; quita; archivo `.txt` y archivo >5 MB rechazados en el cliente; cancelar el editor conserva la foto previa; no admin recibe 404 en el endpoint.

## F. Cierre

- [ ] **T15 — Revisión de rendimiento y bundle**
  Satisfies: US-4 (rendimiento)
  Depends on: T11, T13
  Notes: seguir `docs/RENDIMIENTO.md` (checklist 6 de `CLAUDE.md`): comparar First Load JS de las rutas del usuario contra la línea base (no debe cambiar) y confirmar que `react-easy-crop` solo aparece en los chunks de `/admin/contenido/*`. Medir con `pnpm` según el script de análisis del repo; anotar los números en `docs/RENDIMIENTO.md` si la doc lo pide.

- [ ] **T16 — Pasadas de calidad antes del PR**
  Satisfies: todas
  Depends on: T1–T15
  Notes: `/design-critique` sobre el editor y las tarjetas; `/design-system` por el `Avatar` nuevo (componente compartido); `/simplify` sobre el código nuevo; `pnpm` lint (Biome), typecheck y tests unitarios + integración; e2e del flujo completo. Actualizar `CLAUDE.md` solo si apareció una convención nueva (por ejemplo, "fotos de directorio: bucket público + `Avatar`").

## Orden sugerido para repartir (3 devs)

- **Dev 1 (servidor):** T3 → T4 → T5 → T6 → T7 → T8 → T9
- **Dev 2 (lectura pública):** T2 → T10 → T11 (puede empezar tras T5 con una `urlPublicaFoto` mockeada)
- **Dev 3 (editor):** T12 → T13 → T14 (T14 espera a T6/T7)
- Contrato compartido entre los 3: constantes de T12 (`lib/fotos/constantes.ts`) y la firma de `PUT/DELETE /foto` (diseño §Interfaces).
