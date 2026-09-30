# Bugs y hallazgos — Bloque 12 (calculadoras)

Registro de bugs y hallazgos del Bloque 12. Se anotan acá a medida que
aparecen y se corrigen después, por decisión del equipo (2026-09-28).

**Cómo se usa:**
- Cada entrada tiene un ID, una severidad, su origen (del **original**
  vegroup@b550803 o del **port** a esta app) y un estado.
- Cuando se corrige, se marca `Corregido` con la fecha y el cambio.
- Los bugs de origen **original** tocan la regla "los números no se tocan".
  Antes de corregirlos hay que decidir si el arreglo va primero en el repo
  vegroup o sólo acá.

**Severidades:**
- **Alta:** el usuario ve un dato mal o no puede cotizar.
- **Media:** algo visible que confunde o se ve roto.
- **Baja:** detalle o riesgo a vigilar.

## Pendientes

| ID | Sev. | Origen | Dónde | Qué pasa | Cómo reproducir | Estado |
|---|---|---|---|---|---|---|
| B12-01 | Media | Original | `components/cotizador/QuoteDoc.tsx` (PDF) | En régimen **pequeños envíos**, la hoja imprimible muestra un **"0" suelto**. Usa `{selected.impInternos && Number(...) > 0 && …}`; ahí `impInternos` es el número `0` y React lo imprime. | Régimen "Pequeños envíos" → cotizar → "Descargar PDF". | Pendiente |
| B12-02 | Baja | Original | `components/cotizador/RouteBreakdown.tsx` | Mismo patrón `a && b && …` con `dolarCCL`/`dolarBN`. Si algún dólar queda en `0`, se vería un "0" suelto en el desglose. | Cargar el TC en 0 a mano y cotizar. | Pendiente |
| B12-03 | Media | Original | `lib/cotizador/ncm/search.ts` | Buscar **"constructor"** (o "constructores") rompe la búsqueda con `syn.split is not a function`. `SYNONYMS` es un objeto común y hereda `constructor` del prototipo. La UI lo muestra como error de detección. | Régimen general → escribir "constructor". | Pendiente — el código tiene un comentario |
| B12-04 | Media | Original | `lib/cotizador/ncm/search.ts` | **Ranking local flojo** en consultas comunes. "zapas" sólo encuentra 0709.93 (zapallos); "notebook" pone primero 8414.80; "cargador usb", película fotográfica (3702.54); "mate", té (0902). Con la IA activa, ella elige entre los candidatos. **En modo degradado (IA caída) se usa el primero**, así que la posición queda mal. | Sin `ANTHROPIC_API_KEY`, buscar "zapas". | Pendiente — decidir si se mejoran los sinónimos |
| B12-05 | Baja | Original | `public/cotizador/ncm-2026-1.json` | 1.119 descripciones de sufijo tienen **"?"** en lugar de un carácter acentuado (por ejemplo "?rabes"). Viene así en la base. | Buscar posiciones con acentos en la descripción del sufijo. | Pendiente — se arregla regenerando la base desde el MAESTRO |
| B12-06 | Baja | Original | `lib/cotizador/ncm/base.ts` | `licLabel`/`LIC_LABELS` no se usan en ningún lado. Además el campo `lic` trae nombres de organismo ("SENASA") y no códigos, así que la etiqueta saldría "Intervención aduanera código "SENASA"". | — | Pendiente — código muerto heredado |
| B12-07 | Media | Port / producto | `QuoteDoc.tsx`, `PriceStrategy.tsx` | Aparece la **marca VEGROUP** en la app de OG Circle. La hoja imprimible tiene el logo y los contactos de VEGROUP (WhatsApp, mail, Instagram); la estrategia de venta, el eyebrow "VEGROUP · Estrategia de venta". El texto de WhatsApp del cotizador dice "VEGROUP — Cotización". | Cotizar → ver PDF y estrategia de venta. | Pendiente — decisión de producto |
| B12-08 | Baja | Port | `RouteBreakdown.tsx` | Falta un ícono de **alerta** en el aviso de peso volumétrico: el original usaba ⚠️ y hoy es sólo texto sobre un `inset` ámbar. Agregarlo toca `Icon.tsx` (componente compartido, dispara `/design-system`). | Cotizar con peso volumétrico mayor al real. | Pendiente |
| B12-09 | Baja | Port | `app/api/cotizador/identificar-ncm`, `sugerir-partidas` | **Riesgo, no confirmado.** Sonnet 5 corre con thinking adaptativo por default y el original manda `max_tokens` de 800 y 1200. El thinking consume de ese presupuesto y la respuesta podría cortarse sin bloque `tool_use`, lo que daría 502 intermitentes. Se arregla con `thinking: {type: "disabled"}` o subiendo `max_tokens`. | Mirar en producción con la clave real. | A vigilar |
| B12-10 | Baja | Port | `extraer-documento` (mensaje de error) | El 400 dice "JPG/PNG" pero también acepta WebP y GIF. El texto es literal del original. | Subir un archivo de tipo no soportado. | Pendiente |
| B12-11 | Baja | App (general) | `app/tokens.css` → `--text-muted` | El texto secundario tiene un contraste de ~4:1 sobre el fondo oscuro, apenas por debajo de AA (4,5:1) en letra chica. No es exclusivo de la calculadora: es un token de toda la app. | Revisar hints y placeholders. | Pendiente — decisión de sistema visual |
| B12-12 | Baja | App (general, preexistente) | `middleware.ts` + Vercel Analytics | En local, los scripts `/_vercel/insights/script.js` y `/_vercel/speed-insights/script.js` no existen. El middleware los redirige a `/login` y la consola muestra `Uncaught SyntaxError: Unexpected token '<'`. Pasa en todas las páginas, también en `/login`. En Vercel no ocurre. | Abrir cualquier página en local y mirar la consola. | Pendiente — no es del Bloque 12 |
| B12-13 | Baja | Entorno | Sesión en el navegador de desarrollo | `AuthApiError: refresh_token_not_found` en los logs del dev server. Quedó una sesión vieja porque el E2E se logueó con el mismo usuario seed y rotó el refresh token. No es un bug del código: se resuelve cerrando sesión y volviendo a entrar. | — | Anotado (sin acción) |
| B12-14 | Baja | Port | `CotizadorCourier.tsx` / bundle | `/calculadora` quedó en **200 kB exactos**: cero margen contra el presupuesto de CI. Cualquier import estático nuevo lo rompe. | `pnpm build` + `check-bundle-budget.mjs`. | A vigilar |

## Corregidos

| ID | Fecha | Qué se corrigió |
|---|---|---|
| B12-00 | 2026-09-28 | Botón "Subir proforma / packing list" desbordaba la tarjeta en mobile (375 px). `cotizador.module.css`: `.card > .toggleProforma` permite el salto de línea. |
| B12-15 | 2026-09-28 | Port (VGRP-58) | En mobile (375 px), el `<dl>` de 3 columnas (Total a pagar / Aumento s/FOB / Por unidad) de cada opción de `MaritimoResultado` se superponía: la etiqueta "Aumento s/FOB" se solapaba con el valor de "Total a pagar". `maritimo.module.css`: `.opcionDl` pasa de `repeat(3, minmax(0, 1fr))` fijo a `repeat(auto-fit, minmax(90px, 1fr))`, así baja solo a 2/1 columnas cuando no entran las 3, sin media query, y en desktop sigue mostrando las 3 en una fila. |
