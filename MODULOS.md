# Módulos Funcionales Finales

> Fuente: página de Plane "Módulos Funcionales Finales" (proyecto Sistema OG Circle, VGRP). Última sincronización: 2026-08-21.

Recorrido pantalla por pantalla de la plataforma completa (post-Fase 1), tal como está especificada en `resumen-ejecutivo.md` §2 y modelada visualmente en `inicio-proyecto/app-preview_7.html`. **Ninguna de estas pantallas está construida todavía** — lo que se construye ahora es solo la landing (ver [CONTEXT.md](CONTEXT.md) y [LANDING.md](LANDING.md)).

## 1. Landing page pública

Presenta la plataforma y precios, con CTA de registro/compra. Sin login. Separada de la plataforma privada. Es la única pieza en desarrollo activo hoy — ver [LANDING.md](LANDING.md).

## 2. Inicio (Dashboard)

La pantalla más densa de la plataforma. De arriba a abajo, según el prototipo:

- **Ticker superior** — carrusel de info de depósitos/CUIT + botón de carga de packing list / proforma FOB. Rota cada 4.2 segundos en el prototipo.
- **Stats del usuario** — nivel activo, videos completados (formato "X / 11"), envíos activos.
- **Stage 1** — grid de 8 videos de importaciones. Estado "próximamente" hasta que estén grabados y disponibles.
- **Banner a la calculadora** — acceso directo.
- **Stage 2** — 3 videos para armar tienda (Tienda Nube, Shopify, ambas con Claude Code). Mismo criterio de "próximamente" que Stage 1.
- **Directorio de 6 agentes de compra en China** + video explicativo.
- **Banner de comunidad**.
- **Profesionales al servicio** — 4 perfiles: contable, automatizaciones, agencia de marketing, UGC creator.
- **Servicios financieros** — pagos al exterior, gestión financiera, calculadora de costos locales.

**Regla de UI:** el contenido restringido por nivel queda visualmente bloqueado con indicación de qué nivel hace falta para desbloquearlo (no se oculta sin explicación).

## 3. Calculadora

No es una pantalla propia de la plataforma — es un enlace directo a `vegroup.vercel.app/calculadora`, ya construida. Pendiente confirmar si se migra al dominio de la plataforma.

## 4. Comunidad

Feed tipo foro: publicar, dar like, comentar. Widget lateral con miembros activos/en línea. En el prototipo, publicar un post lo inserta al principio del feed sin recargar. Fase 4 en el roadmap (post-tracción) — la versión mínima de "publicar y ver feed, sin likes/comentarios" podría entrar antes si el timeline de Fase 2 lo permite (brief técnico §8).

## 5. Tracking de envíos

Buscador de número de seguimiento + línea de tiempo del envío. Integración con Traxcargo vía enlace directo, mismo modelo que la calculadora — sin reconstruir ni API propia. Pregunta abierta: si el enlace de Traxcargo acepta parámetros para pre-cargar el número de seguimiento desde la plataforma.

## 6. Perfil

- Datos del usuario y nivel activo.
- Accesos habilitados según nivel.
- Accesos rápidos: mis envíos, documentos, cerrar sesión.
- Soporte vía link directo a WhatsApp (wa.me, sin API).

## 7. Panel de administración

No se construye para el lanzamiento — decisión explícita registrada en `brief-tecnico-programador.md` §2. Cuando exista (Fase 3 según el roadmap), cubre:

- Confirmación manual de pagos por transferencia bancaria y USDT, con visualización del comprobante subido.
- Gestión de usuarios: ver nivel activo, activar o cambiar nivel manualmente.
- Gestión de contenido: agentes de compra, videos, profesionales, servicios.
- Actualización de precios sin tocar código.

Hasta que exista, la confirmación de pagos manuales se resuelve con un mini-endpoint o script sin interfaz.

## 8. Navegación

Header con menú hamburguesa (no sidebar fija) que abre un panel lateral (drawer) con los 5 destinos: Inicio, Calculadora, Comunidad, Tracking, Perfil.

## 9. Si querés hacer X, andá a Y

| Si querés... | Mirá |
|---|---|
| Cambiar el copy o diseño de la landing | `landing.md` + [LANDING.md](LANDING.md) |
| Entender qué pasa cuando alguien paga | [CONTEXT.md](CONTEXT.md) §5, §6 |
| Ver la forma de los datos de agentes, envíos o videos | página Modelo de Datos (Plane), y el bloque `<script>` de `inicio-proyecto/app-preview_7.html` (líneas 526-689) |
| Saber qué nivel desbloquea qué | [CONTEXT.md](CONTEXT.md) §3 (matriz de acceso) |
| Entender por qué no hay panel de admin en el lanzamiento | esta página §7, y [CONTEXT.md](CONTEXT.md) §6 |
| Ver qué se construye en cada fase | [CONTEXT.md](CONTEXT.md) — Roadmap de 4 fases |
