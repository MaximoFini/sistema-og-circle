# Requirements: VGRP-57 — Calculadora de importación (courier) embebida en la app

**Status:** Approved (2026-09-26) — ajustado después de aprobar: límite de proforma 3 MB y redirect a /comprar (ver US-2 y US-4)
**Last updated:** 2026-09-26

## Summary

Primer ticket del **Bloque 12 — Calculadoras dentro de la plataforma** (proyecto
VGRP en Plane, Epic "Fase 2 — MVP para cobrar"). El segundo es VGRP-58
(cotizador marítimo, `requirements-vgrp58.md`), que depende de este.

Hoy "Calculadora" (en el menú y en el banner de Inicio) es un link externo a
`vegroup.vercel.app/calculadora`, con su propio login por clave compartida.
Este ticket trae la calculadora **adentro de la app**, como una página propia
detrás del login y del gating por nivel pago. El código se porta del repo
privado `emilianoverabusiness-blip/vegroup` y la UI se reconstruye con el
sistema "Liquid Glass".

**Cambio de una decisión previa:** VGRP-31 (`specs/bloque-8-secciones-producto/requirements-vgrp31.md`)
había dejado registrado que la calculadora "no se migra en Fase 2" y seguía
como link externo. Este ticket revierte esa decisión a pedido del equipo
(2026-09-26). También queda cerrada la decisión abierta de la página
"Orden Implementaciones" ("Si la calculadora se migra al dominio de la
plataforma"): sí se migra.

## Origen del código

| Qué | Valor |
|---|---|
| Repo | `emilianoverabusiness-blip/vegroup` (privado) |
| Commit base | `b550803` (2026-09-03, "Consolidar colores en src/tokens.css…") |
| Estrategia | **Copia única.** Se porta desde ese commit y se deja registrado el origen. Los cambios futuros del repo vegroup (tarifas, fórmulas) se portan a mano. No hay sincronización automática. |
| Qué se porta en este ticket | La página `/calculadora` completa (courier aéreo): `AgentQuote`, `RouteBreakdown`, `PriceStrategy`, `MarketingAnalysis`, `ProformaUpload`, `QuoteDoc`, `lib/calc.js`, `lib/ncmSearch.js`, `data/ncm.js` + `ncm.json`, `lib/api.js`, y los endpoints `identify`, `suggest`, `analyze`, `extract` y `dolar`. |
| Qué queda para VGRP-58 | `/maritimo` (motor, tarifas, `dolar-cda`, sus componentes y su test). |
| Qué no se porta nunca | `/interno` (son costos y margen propios de VeGroup y no se muestran a clientes) y su panel de tarifas. Tampoco la landing estática ni el login por clave (`Login.jsx`, `api/login.js`, `api/_auth.js`, `APP_ACCESS_CODE`). |

## Goals

- Un usuario con plan (Principiante o Avanzado) cotiza una importación courier
  sin salir de la app, con el **mismo contenido y comportamiento** que
  `vegroup.vercel.app/calculadora` en el commit base.
- Los puntos de entrada existentes ("Calculadora" en el menú y "Abrir
  calculadora" en Inicio) llevan a la página interna en vez de a una URL
  externa.
- Los números que devuelve el motor portado son **idénticos** a los del
  original para las mismas entradas: es una copia, no una reinterpretación.
- La UI **copia el sistema visual actual de la app** (Liquid Glass). No es el
  sitio original incrustado.
- Queda portada la infraestructura sin números adentro que VGRP-58 reutiliza:
  - base NCM y búsqueda;
  - identificación por IA;
  - lectura de proforma;
  - cliente de API;
  - gating de los endpoints.

## Non-goals

- **El cotizador marítimo.** Es VGRP-58.
- **`/interno`**, la landing estática de vegroup y cualquier otra página de ese
  repo.
- **El login por clave compartida del original.** Se reemplaza por la sesión
  de Supabase que la app ya tiene.
- **Límite de uso / rate limiting** de los endpoints de IA. Es una decisión
  explícita del equipo (ver Constraints → riesgo de costo).
- **Formulario de lead** (nombre + WhatsApp) antes del análisis de marketing.
  El usuario ya está identificado.
- **Tarifas editables sin deploy** (Edge Config o panel admin). Las constantes
  quedan en código, igual que en el original.
- **Cambiar fórmulas, tarifas o textos de negocio** del original. Cualquier
  corrección se hace primero en el repo vegroup y después se porta.
- **Dar de baja `vegroup.vercel.app/calculadora`.** Sigue existiendo fuera de
  esta app.
- **Borrar `links.calculadora` de Edge Config.** Deja de usarse en la app, pero
  el campo se mantiene en el schema y en el panel admin (VGRP-40) para no
  romper nada.

## User stories

### US-1: Entrar a la calculadora desde los mismos lugares de siempre

Como usuario con plan, quiero que "Calculadora" me lleve a la calculadora
dentro de la app, para no salir a otro sitio ni loguearme con otra clave.

**Acceptance criteria:**

- WHEN el usuario toca "Calculadora" en el menú de navegación THE SYSTEM SHALL
  navegar a `/calculadora` en la misma pestaña, dentro del layout de la app.
- WHEN el usuario toca "Abrir calculadora" en el banner de Inicio THE SYSTEM
  SHALL navegar a `/calculadora` en la misma pestaña, y el CTA SHALL NOT
  mostrar el ícono de link externo.
- WHILE el usuario está en `/calculadora` THE SYSTEM SHALL marcar
  "Calculadora" como destino activo en el menú, igual que el resto de los
  destinos internos.
- THE SYSTEM SHALL NOT pedir ninguna clave de acceso adicional: alcanza con
  la sesión de la app.
- THE SYSTEM SHALL NOT leer `links.calculadora` de Edge Config para ninguno de
  los dos puntos de entrada.

### US-2: Gating por plan

Como negocio, quiero que solo los usuarios con plan usen la calculadora,
porque es parte del producto pago.

**Acceptance criteria:**

- IF un usuario sin sesión pide `/calculadora` THEN THE SYSTEM SHALL
  redirigirlo al login y, después de loguearse, devolverlo a `/calculadora`
  (mismo mecanismo `next` que el resto de la app).
- IF un usuario logueado con nivel `ninguno` pide `/calculadora` THEN THE
  SYSTEM SHALL redirigirlo a `/comprar`, sin renderizar la calculadora
  (decidido con el equipo el 2026-09-26: redirect directo, no pantalla
  bloqueada).
- IF un usuario sin sesión o con nivel `ninguno` llama directamente a
  cualquiera de los endpoints de la calculadora THEN THE SYSTEM SHALL
  responder 401 (sin sesión) o 403 (sin plan) en JSON, y SHALL NOT llamar a
  la API de Anthropic ni a servicios externos.
- WHEN el usuario tiene nivel `principiante` o `avanzado` THE SYSTEM SHALL
  darle acceso completo. No hay diferencias de funcionalidad entre niveles.

### US-3: Cotizar un envío courier (paridad con `/calculadora`)

Como usuario con plan, quiero cotizar mi importación con los tres regímenes y
las tres rutas, para saber cuánto me sale realmente el producto puesto en
Argentina.

**Acceptance criteria:**

- THE SYSTEM SHALL ofrecer los tres regímenes del original: courier integral,
  pequeños envíos y régimen general, con los mismos límites y validaciones
  (por ejemplo, el tope de FOB y de unidades de pequeños envíos).
- WHEN el usuario describe el producto en lenguaje coloquial en régimen
  general THE SYSTEM SHALL identificar la posición NCM/SIM igual que el
  original:
  - primero con la búsqueda local sobre la base NCM completa;
  - si no hay candidatos, con la sugerencia de partidas por IA;
  - al final, con la elección de la posición exacta por IA;
  - y SHALL mostrar la interpretación, la posición elegida y sus alícuotas
    (DIE, TE, IVA y el resto que muestre el original).
- IF la IA no responde o falla THEN THE SYSTEM SHALL dejar que el usuario
  elija entre los candidatos locales o cargue la posición a mano (mismo
  comportamiento degradado que el original), y SHALL NOT bloquear la
  cotización.
- WHEN se abre la calculadora THE SYSTEM SHALL cargar automáticamente el
  dólar oficial BNA.
- IF la cotización del dólar no se puede obtener THEN THE SYSTEM SHALL
  permitir cargarla a mano y SHALL NOT inventar un valor.
- WHEN el usuario completa los datos y toca "Cotizar" THE SYSTEM SHALL
  calcular con el motor portado de `calc.js`. Los datos son FOB, peso,
  dimensiones, unidades y depósito de origen (Miami, Barcelona o Guangzhou).
- WHEN termina el cálculo THE SYSTEM SHALL mostrar el desglose de la ruta
  elegida y las otras como referencia, con las mismas líneas y el mismo
  orden que `RouteBreakdown`.
- THE SYSTEM SHALL mostrar el total en USD y ARS, el costo por kg y el costo
  por unidad.
- WHEN se calcula con las mismas entradas y el mismo tipo de cambio THE
  SYSTEM SHALL producir exactamente los mismos importes que el original en el
  commit base, al centavo.

### US-4: Cargar los datos desde una proforma o packing list

Como usuario con plan, quiero subir mi proforma o packing list para no tipear
los datos a mano.

**Acceptance criteria:**

- WHEN el usuario sube una imagen o un PDF THE SYSTEM SHALL extraer los datos
  con IA y precargar los campos del formulario, igual que `ProformaUpload`
  del original.
- THE SYSTEM SHALL aceptar archivos de **hasta 3 MB** y SHALL avisar ese
  límite antes de subir.
- IF el archivo pesa más de 3 MB THEN THE SYSTEM SHALL rechazarlo en el
  navegador, antes de enviarlo, con un mensaje que diga el límite.
- IF la extracción falla o el archivo no es de un tipo soportado THEN THE
  SYSTEM SHALL mostrar el error y dejar el formulario editable a mano.

> **Desvío deliberado del original (decidido con el equipo, 2026-09-26):** el
> original anuncia 8 MB, pero el archivo viaja en base64 (+33%) y Vercel corta
> los pedidos de más de 4,5 MB. En la práctica, cualquier archivo de más de
> ~3,3 MB ya falla hoy. Se baja el límite a 3 MB para que el aviso diga la
> verdad. Es la única diferencia de comportamiento con el original en este
> ticket.

### US-5: Imprimir / guardar en PDF la cotización

Como usuario con plan, quiero una hoja de cotización imprimible, para
guardarla o compartirla.

**Acceptance criteria:**

- WHEN el usuario toca imprimir en un resultado THE SYSTEM SHALL abrir el
  diálogo de impresión del navegador con la hoja de cotización, equivalente a
  `QuoteDoc`.
- En esa impresión SHALL NOT aparecer el menú, el header ni ningún otro
  elemento de la app.

### US-6: Análisis de marketing con IA

Como usuario con plan, quiero sugerencias de público, ángulos de venta,
contenido, campaña, precio y riesgo, para saber cómo vender lo que importo.

**Acceptance criteria:**

- WHEN el usuario pide el análisis después de cotizar THE SYSTEM SHALL
  devolver las mismas secciones que `MarketingAnalysis` del original, sin
  pedir nombre ni WhatsApp.
- IF la IA falla THEN THE SYSTEM SHALL mostrar el error y permitir
  reintentar, sin perder la cotización ya hecha.

### US-7: Estrategia de venta

Como usuario con plan, quiero ver en qué canal me conviene vender y a qué
precio, para ganar el margen que busco.

**Acceptance criteria:**

- WHEN hay una cotización calculada THE SYSTEM SHALL tomar automáticamente el
  costo por unidad, convertirlo a ARS con el tipo de cambio del día y mostrar
  el ranking de canales del original. Los canales son ML clásica/premium,
  Tiendanube, Shopify, Empretienda y web propia, con el precio necesario en
  cada uno para el margen elegido.
- WHEN el usuario cambia el margen deseado o el envío al comprador THE SYSTEM
  SHALL recalcular el ranking en el momento.

### US-8: Se ve como el resto de la app

Como usuario, quiero que la calculadora se vea como una pantalla más de la
plataforma, no como otro sitio.

**Acceptance criteria:**

- THE SYSTEM SHALL construir la UI con las primitivas de
  `components/ui/glass.module.css` y `type.module.css` (vía `composes`), los
  componentes compartidos de `components/ui` y los tokens de `app/tokens.css`.
- THE SYSTEM SHALL NOT incluir el CSS del original (`index.css`,
  `tokens.css`), su paleta dorada ni las fuentes IBM Plex.
- THE SYSTEM SHALL funcionar en mobile y en desktop con los mismos
  breakpoints y el mismo layout de página que el resto de `(app)`.

## Constraints

- **Stack de la app:** Next.js 15 App Router, TypeScript `strict` con
  `allowJs: false`, CSS Modules y Biome. El código original es JS/JSX con
  Vite y funciones serverless de Vercel (`api/*.js`), así que se adapta a TS,
  no se pega tal cual. El cómo se define en design.
- **Sistema visual:** la UI se arma con las primitivas de Liquid Glass, sin
  redeclarar sus propiedades (regla dura de `CLAUDE.md` / `DESIGN.md`). La
  pantalla pasa `/design-critique` antes de darse por terminada.
- **Rendimiento:** la base NCM pesa ~5,5 MB. Tiene que quedar fuera del First
  Load JS de `/calculadora` y dentro del presupuesto de
  `scripts/check-bundle-budget.mjs`, que rompe CI (ver `docs/RENDIMIENTO.md`).
  El presupuesto no se sube para hacerle lugar. El shell de `(app)` tiene que
  seguir siendo estático.
- **Auth:** el gating reusa `middleware.ts` y `lib/auth/claims.ts`
  (`hasNivel`). No se crea un mecanismo nuevo.
- **Secretos:** `ANTHROPIC_API_KEY` es la misma clave del proyecto vegroup.
  Hay que cargarla en las env vars de Vercel de esta app antes del deploy, y
  tiene que vivir solo del lado del servidor (`server-only`).
- **Riesgo de costo (aceptado):** sin límite de uso, cualquier usuario con
  plan puede llamar a los endpoints de IA sin tope. El análisis de marketing
  usa `claude-opus-4-8` por default. Queda registrado como riesgo conocido y
  decidido.
- **Paridad verificable:** tiene que haber tests con casos fijos que comparen
  el motor portado contra el original, en los tres regímenes y las tres
  rutas.

## Open questions

- Ninguna. Las tres que había se resolvieron con el equipo el 2026-09-26:
  - **Clave de Anthropic:** es la misma del proyecto vegroup.
  - **`links.calculadora`:** deja de usarse en la app y el campo queda.
  - **Ruta del marítimo:** `/maritimo` (aplica a VGRP-58).
