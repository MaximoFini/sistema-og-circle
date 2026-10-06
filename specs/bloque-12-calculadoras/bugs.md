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
| B12-04 | Media | Original | `lib/cotizador/ncm/search.ts` | **Ranking local flojo** en consultas comunes. "zapas" sólo encuentra 0709.93 (zapallos); "notebook" pone primero 8414.80; "cargador usb", película fotográfica (3702.54); "mate", té (0902). Con la IA activa, ella elige entre los candidatos. **En modo degradado (IA caída) se usa el primero**, así que la posición queda mal. | Sin `ANTHROPIC_API_KEY`, buscar "zapas". | Pendiente — decidir si se mejoran los sinónimos |
| B12-05 | Baja | Original | `public/cotizador/ncm-2026-1.json` | 1.119 descripciones de sufijo tienen **"?"** en lugar de un carácter acentuado (por ejemplo "?rabes"). Viene así en la base. | Buscar posiciones con acentos en la descripción del sufijo. | Pendiente — se arregla regenerando la base desde el MAESTRO |
| B12-06 | Baja | Original | `lib/cotizador/ncm/base.ts` | `licLabel`/`LIC_LABELS` no se usan en ningún lado. Además el campo `lic` trae nombres de organismo ("SENASA") y no códigos, así que la etiqueta saldría "Intervención aduanera código "SENASA"". | — | Pendiente — código muerto heredado |
| B12-08 | Baja | Port | `RouteBreakdown.tsx` | Falta un ícono de **alerta** en el aviso de peso volumétrico: el original usaba ⚠️ y hoy es sólo texto sobre un `inset` ámbar. Agregarlo toca `Icon.tsx` (componente compartido, dispara `/design-system`). | Cotizar con peso volumétrico mayor al real. | Pendiente |
| B12-09 | Baja | Port | `app/api/cotizador/identificar-ncm`, `sugerir-partidas` | **Riesgo, no confirmado.** Sonnet 5 corre con thinking adaptativo por default y el original manda `max_tokens` de 800 y 1200. El thinking consume de ese presupuesto y la respuesta podría cortarse sin bloque `tool_use`, lo que daría 502 intermitentes. Mitigado en VGRP-69: `server/anthropic.ts` manda `thinking: {type: "disabled"}` en todas las llamadas. | Mirar en producción con la clave real. | Mitigado — falta verificar con la clave real (F16 de tasks-vgrp69.md) |
| B12-11 | Baja | App (general) | `app/tokens.css` → `--text-muted` | El texto secundario tiene un contraste de ~4:1 sobre el fondo oscuro, apenas por debajo de AA (4,5:1) en letra chica. No es exclusivo de la calculadora: es un token de toda la app. | Revisar hints y placeholders. | Pendiente — decisión de sistema visual |
| B12-12 | Baja | App (general, preexistente) | `middleware.ts` + Vercel Analytics | En local, los scripts `/_vercel/insights/script.js` y `/_vercel/speed-insights/script.js` no existen. El middleware los redirige a `/login` y la consola muestra `Uncaught SyntaxError: Unexpected token '<'`. Pasa en todas las páginas, también en `/login`. En Vercel no ocurre. | Abrir cualquier página en local y mirar la consola. | Pendiente — no es del Bloque 12 |
| B12-13 | Baja | Entorno | Sesión en el navegador de desarrollo | `AuthApiError: refresh_token_not_found` en los logs del dev server. Quedó una sesión vieja porque el E2E se logueó con el mismo usuario seed y rotó el refresh token. No es un bug del código: se resuelve cerrando sesión y volviendo a entrar. | — | Anotado (sin acción) |
| B12-14 | Baja | Port | `CotizadorCourier.tsx` / bundle | `/calculadora` quedó en **200 kB exactos**: cero margen contra el presupuesto de CI. Cualquier import estático nuevo lo rompe. | `pnpm build` + `check-bundle-budget.mjs`. | A vigilar |
| B12-16 | Baja | App (VGRP-70) | `/api/cotizador/*` | **Riesgo de costo.** Cada foto de `identificar-producto` es una llamada de visión a Anthropic, y no hay rate limit propio: sólo el gating por plan. Un usuario con plan podría disparar muchas seguidas. | — | A vigilar — decidir si se agrega un límite por usuario |

## Corregidos

| ID | Fecha | Qué se corrigió |
|---|---|---|
| B12-00 | 2026-09-28 | Botón "Subir proforma / packing list" desbordaba la tarjeta en mobile (375 px). `cotizador.module.css`: `.card > .toggleProforma` permite el salto de línea. |
| B12-15 | 2026-09-28 | Port (VGRP-58) | En mobile (375 px), el `<dl>` de 3 columnas (Total a pagar / Aumento s/FOB / Por unidad) de cada opción de `MaritimoResultado` se superponía: la etiqueta "Aumento s/FOB" se solapaba con el valor de "Total a pagar". `maritimo.module.css`: `.opcionDl` pasa de `repeat(3, minmax(0, 1fr))` fijo a `repeat(auto-fit, minmax(90px, 1fr))`, así baja solo a 2/1 columnas cuando no entran las 3, sin media query, y en desktop sigue mostrando las 3 en una fila. |
| B12-01 | 2026-10-05 | VGRP-69 — `QuoteDoc`: el "0" suelto de pequeños envíos. `{Number(selected.impInternos) > 0 && …}` en vez de `impInternos && …`. |
| B12-02 | 2026-10-05 | VGRP-69 — `RouteBreakdown`: mismo patrón con `dolarCCL`/`dolarBN`, ahora `Number(x) > 0 && …`. |
| B12-03 | 2026-10-05 | VGRP-69 — `ncm/search.ts`: el lookup de `SYNONYMS` usa `Object.hasOwn`, así "constructor"/"constructores" ya no rompen la búsqueda. Test en `search.test.ts`. Único desvío del original en ese archivo; no cambia el ranking. |
| B12-07 | 2026-10-05 | VGRP-69 — marca OG Circle en el WhatsApp del courier, `QuoteDoc`, `MaritimoQuoteDoc`, `PriceStrategy`, `RouteBreakdown` y los prompts de IA. Número de cotización `OG-…`. El contacto sale de `links.whatsapp` (`getWhatsappContacto()`). |
| B12-10 | 2026-10-05 | VGRP-69 — `extraer-documento`: el 400 dice "JPG, PNG, WebP o GIF". |
