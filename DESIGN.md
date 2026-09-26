# Guía de Diseño y Estilos — VeGroup

> Fuente: página de Plane "Guía de Diseño y Estilos (design.md)" (proyecto Sistema OG Circle, VGRP). Replicado desde `design.md` del repo — última sincronización manual: 21/08/2026.

Documenta el sistema visual realmente implementado en la landing (`app/globals.css`, `app/layout.tsx`, `app/page.tsx`, `app/components/`).

**Ojo — esto describe la landing pública, un deploy distinto.** En el repo de *Sistema OG Circle* (este, el del dashboard/`(app)`/`admin`) no existe `app/globals.css` ni el `.bp-*` de la nota de abajo: son 137 líneas en `app/tokens.css` más ~2.400 en 18 módulos CSS de `app/`/`components/`, sin CSS muerto detectado (VGRP-56, grep de `bp-` sobre todo `.css`/`.tsx`: cero resultados). El plan de carga de fuentes de §2 (`<link>` manual + `preconnect` a tres orígenes + `preload` del woff2) tampoco aplica acá — ver `docs/RENDIMIENTO.md` para el plan de fuentes de este repo (`next/font`, sólo los pesos que el CSS de este repo realmente usa).

---

## Sistema de ESTE repo (dashboard / admin): "Liquid Glass"

UI de `(app)`, `(auth)`, `(legal)` y `admin` (septiembre 2026, segunda versión). Referencia: el lenguaje de Apple (materiales de vidrio, listas agrupadas, tipografía por rol) con la paleta de la landing: negro `#050505`, un único acento ámbar `#d99e00`→`#f5b813`, champán para detalles. El resto de este documento (desde "Nota de historial") describe **la landing**, no esto.

**Principios**

1. **Contención.** Una familia tipográfica, un acento, jerarquía por tamaño/peso/opacidad. Nada de mayúsculas espaciadas, texto con gradiente, halos luminosos ni brillos decorativos.
2. **Material, no bordes.** Las superficies son vidrio sobre un fondo cálido **estático** (tres luces difusas + viñeta + grano con la receta de `.film-grain` de la landing, en `app/tokens.css`). El fondo no se anima: obligaría a recalcular cada `backdrop-filter` en cada frame.
3. **El ámbar significa algo:** acción principal, progreso o estado activo. Nunca de fondo detrás de texto blanco (texto sobre ámbar: `--on-accent`).

**Tipografía** — Inter variable con eje de tamaño óptico (`opsz`), `font-optical-sizing: auto` (mismo principio que SF Pro Text/Display). Escala de Apple en `tokens.css` (`--fs-large-title` … `--fs-caption`) y roles en `components/ui/type.module.css`: `eyebrow` (rótulo en champán, sentence case), `largeTitle`, `title1`, `title2`, `headline`, `lede`, `body`, `footnote`. Títulos con tracking negativo (-0.02 a -0.03em), peso 650–700.

> La landing usa Helvetica Now Var. Es una fuente comercial de Monotype y no hay licencia verificada para este producto: no se embebe hasta confirmarla (cambiarla es una línea en `app/layout.tsx`).

**Material** (`components/ui/glass.module.css`) — tres grosores, como los materiales de Apple:

| Clase | Uso | Blur |
|---|---|---|
| `thin` | header, controles flotantes | 20px |
| `surface` | tarjetas y secciones | 32px |
| `raised` | hojas y diálogos (menú, login) | 48px, más opaco |
| `inset` | grupo/tarjeta anidada (sin blur propio: el padre ya refracta) | — |
| `chip` / `chipAccent` | etiquetas en píldora | — |
| `accent` | modificador: reflejo ámbar en el borde. Uno por pantalla. | — |

Anatomía: relleno translúcido + brillo sutil arriba + `backdrop-filter` (blur + saturación) + reflejo especular del borde (`::before`, gradiente vertical enmascarado a 1px — la receta de `.liquid-glass` de la landing) + sombra suave.

**Formas:** botones = cápsula (`--radius-pill`), planos, sin brillo ni halo. Controles 14px, filas 16px, tarjetas 22px, secciones 28px, hojas 34px.

**Componentes** (`components/ui/`, se importan de `@/components/ui`)

| Componente | Notas |
|---|---|
| `Button` | `variant`: `primary` (ámbar sólido, texto `--on-accent`) o `ghost` (vidrio). `size`: `md` (48px) o `sm` (34px, para acciones dentro de filas o tarjetas). Cápsula, plano; única microinteracción: se comprime al presionar. `loading` muestra el indicador de anillo. Un link con look de botón compone `button primary`/`ghost` de `Button.module.css`, no anida un `<button>` en un `<a>`. |
| `TextField` / `TextFieldBase` | Relleno translúcido sin borde, label arriba en sentence case, foco con anillo ámbar. 16px como mínimo (iOS no hace zoom). |
| `Checkbox` | Círculo dibujado con CSS; se llena de ámbar al marcarse. |
| `FormError` | Franja teñida de rojo, sin borde duro. |
| `TextLink` | Link de texto mudo (`--fs-footnote`). Trae su propio color y transición: ver la regla de abajo. |
| `ContenidoBloqueado` | Fila compacta: candado + "Disponible desde nivel X" + CTA `sm`. Nunca oculta la sección (PRD §6). |
| `Icon` | 13 íconos propios: `inicio`, `calculadora`, `comunidad`, `tracking`, `perfil`, `chevron`, `externo`, `candado`, `check`, `salir`, `mensaje`, `documento`, `play`. Un ícono nuevo se agrega en `PATHS` (grilla de 24px, trazo 1.7px) y aparece tipado en `IconName`. |

**Patrones**

- **Lista agrupada** (Ajustes de iOS): título de grupo por fuera, filas de ≥44px con ícono en tile de 32px, separador inset que arranca después del ícono, chevron / flecha externa / "Próximamente" a la derecha. Menú, Perfil, legales, admin.
- **Íconos:** `components/ui/Icon.tsx`, SVG inline propios, trazo 1.7px con puntas redondeadas (familia visual de SF Symbols). Sin dependencia nueva.
- **Header:** cápsula `thin` flotante. Desde 900px suma accesos rápidos con un **indicador deslizante** (píldora de vidrio que va al activo o al hover; `RapidaNav.tsx`, mismo mecanismo en `app/admin/AdminNav.tsx`).
- **Menú:** hoja inferior en mobile (con agarradera), popover anclado al botón en desktop. Cuenta arriba, destinos, "Cerrar sesión" en rojo al final.
- **Lockup de marca:** isotipo dentro de un disco oscuro (`#0d0d0f`, borde de 1px) + "OG Circle" en 650, mayúsculas con tracking 0.16em. Es el mismo en el header de la app, el admin y el login; el isotipo nunca va solo (queda huérfano). El recorte del hexágono sale del PNG con "sprite crop" (ver `nav.module.css`), sin un segundo asset.
- **Frase de marca** ("El círculo de los que *importan*."): sólo en `(auth)`. Misma voz que un Large Title; el acento es el ámbar de las acciones (`--accent`) — sin itálica ni gradiente.
- **Pantalla de acceso** (`app/(auth)/layout.tsx`): grilla con áreas `hero / card / pie`. El lockup va apoyado sobre la frase, como una firma: un solo bloque, nunca dos anclas separadas. Mobile: apilado y centrado, con la frase un escalón arriba del título de la tarjeta. Desde 1024px: el bloque a la izquierda, centrado verticalmente contra el formulario, con la frase a tamaño titular (64–96px) y cortes fijos "El círculo / de los que / importan." (`.linea`, sólo desktop); el pie va debajo del formulario.
- **Tarjeta de contacto** (agentes, profesionales): avatar con iniciales (`iniciales.ts`, gris cálido como los contactos de Apple), nombre, una línea de metadata, y el dato de contacto abajo separado por una línea. Nombre y metadata van en `<span>`, no `<div>`: los E2E localizan la tarjeta por el último `div` que contiene el nombre.
- **Progreso:** anillo (conic-gradient) que se llena con transición (`--progreso` registrado como `<percentage>`).
- **Estados vacíos** (sin nivel, checkout no disponible, pago pendiente): centrados — ícono en disco, título, texto, una acción. Pendiente usa el indicador de actividad de rayos.

**Microinteracciones** (sólo `transform`/`opacity`, todas apagadas bajo `prefers-reduced-motion` con un override global en `tokens.css`): botones que se comprimen al presionar (resorte), indicador deslizante de navegación, anillo de progreso, hover de tarjetas −2px (sólo con puntero), entrada de página (fundido + 6px, una vez), hoja/popover del menú.

**Regla para componer primitivas:** `composes: surface from "../ui/glass.module.css";` y **no redeclarar** propiedades que la primitiva define — con `composes` entre archivos el orden de carga no está garantizado (pasó: el drawer quedaba `position: relative`). Se ajusta con variables registradas `inherits: false` en `tokens.css`: `--g-position`, `--g-radius`, `--g-bg`, `--rim` (vidrio) y `--t-size`, `--t-margin`, `--t-color` (tipografía). Cuando hace falta pisar una propiedad igual, usar un selector más específico (`.a.b`, `a.clase`), nunca depender del orden.

**Estabilidad de layout:** `html { scrollbar-gutter: stable }` reserva el lugar de la barra de scroll, así abrir el menú (que bloquea el scroll del body) no corre la página.

**`<TextLink>` + clase propia:** `TextLink` trae su `.link` (tamaño/color/transición de link de texto). Para que un link se vea como tarjeta o botón, usar `NextLink`/`<a>` directo; en el admin, `a.clase` (gana en especificidad, incluida la `transition`). `TextLink` no define `border-radius` a propósito: le pisaría el radio a una superficie de vidrio (pasó: las tarjetas del admin quedaron rectas).

---

**Nota de historial:** la versión anterior de este documento describía un concepto de papelería aduanera ("Despacho, no dashboard": fondo manila `#EFEBE3`, Instrument Serif, sellos rojos, tags con perforación). Ese sistema fue reemplazado por completo en el commit `044606c` ("rediseño NEXOVA — dark cinematic") y ya no queda nada de él en el código. Este documento describe lo que hay hoy.

**Segunda pasada:** la revisión anterior describía un `BlueprintSteps.tsx` — un contenedor marítimo 3D (`.bp-wrapper`/`.bp-viewport`/`.bp-stage`/`.bp-rotator`/`.bp-face`) para la sección "Cómo funciona". Ese componente ya no existe en `app/components/`. Las clases `.bp-*` siguen físicamente en `globals.css` (~530 líneas) pero son CSS muerto (ver §6). Las secciones #problema y #pilares-servicio se rehicieron con `ProblemStepper.tsx` y `OGCircleFeatures.tsx`, mecanismos distintos (§3). Esta pasada incorpora además `AmbientAudio.tsx`, `WorldClocks.tsx`, `StoryCollapse.tsx` y el ticker de rutas (`.route-ticker`).

**Tercera pasada (esta revisión):** la calculadora vieja (`.calc-v2-*`, dos paneles inputs/resultados, terminal falsa, `AnimatedNumber`) ya no existe en absoluto. `CostCalculator.tsx` pasó a ser solo una fila de CTA que abre `DemoModal.tsx` (primer modal/dialog del repo) con un simulador real portado de otro repo de VeGroup, con backend propio (`app/api/demo/*`, IA de Anthropic, `@vercel/kv`) y su propia hoja de estilos (`app/styles/21-demo.css`, ~590 líneas, remapeada a los tokens dark de este sistema). Ver §3 y §6.

## 0. Concepto: "NEXOVA — dark cinematic"

Fondo casi negro, video de hero a pantalla completa, superficies de vidrio (`backdrop-filter`) y un único acento ámbar en gradiente. La referencia es SaaS premium / producto tecnológico, no papelería física.

Tres decisiones que atraviesan todo:

1. **Dark mode como único modo.** No hay tema claro ni tokens de tema claro. `html` y `body` fijan `#050505`.
2. **Jerarquía por opacidad de blanco, no por color.** Casi todo el texto y todos los bordes son `rgba(255,255,255,x)`. El color se reserva para el acento.
3. **Un solo acento.** Ámbar `#d99e00` → `#f5b813`, casi siempre como gradiente horizontal o color plano al 100%. Aparece en CTAs, números de paso, barras de hover y highlights de texto.

## 1. Paleta de colores

Tokens en `:root` de `app/globals.css`.

| Rol | Variable | Valor | Uso |
|---|---|---|---|
| Acento (inicio) | `--accent-from` | `#d99e00` | Color plano del acento; inicio del gradiente. |
| Acento (fin) | `--accent-to` | `#f5b813` | Fin del gradiente de CTAs y barras. |
| Acento 5% | `--accent-05` | `rgba(217,158,0,.05)` | Fondo de `.price-card.featured`. Remapeada como `--gold-soft` en `.vg-demo` (el Demo). |
| Acento 40% | `--accent-40` | `rgba(217,158,0,.4)` | Borde de input en foco y arranque de pulse-dot. |
| Fondo de página | `--bg` | `#050505` | `html`, `body`, `.site-footer`, y color de texto sobre botones ámbar. |
| Superficie 1 | `--surface-1` | `#0a0a0a` | Tarjetas (`.problem-card-v2`, `.feature-card-v2`). |
| Superficie 1 (hover) | `--surface-1-hover` | `#111111` | Hover de esas mismas tarjetas. |
| Superficie 2 | `--surface-2` | `#080808` | Panel de inputs de la calculadora (histórico). |
| Superficie 3 | `--surface-3` | `#060606` | Panel de resultados de la calculadora (histórico). |
| Champán | `--champagne` | `rgba(232,210,170,.88)` | Números del hero (`.num-card .number`). Único color de texto que no es blanco ni ámbar. |
| Error | `--danger` | `#ef4444` | Cruz de `.disqualify-list`. |
| Vidrio (fondo) | `--glass-bg` | `rgba(255,255,255,.04)` | Fondo de `.glass-card`. |
| Vidrio (borde) | `--glass-border` | `rgba(255,255,255,.08)` | Borde por defecto de tarjetas y separadores. |
| Vidrio (borde activo) | `--glass-border-active` | `rgba(255,255,255,.18)` | Borde en hover. |
| Texto principal | `--text-primary` | `rgba(255,255,255,.92)` | Headings y body principal. |
| Texto secundario | `--text-secondary` | `rgba(255,255,255,.5)` | `.lede`, descripciones. |
| Texto atenuado | `--text-muted` | `rgba(255,255,255,.46)` | Labels, disclaimers, metadata. |

Las tres superficies son el recurso principal del sistema para separar planos sin usar bordes: cuanto más oscuro, más al fondo.

**Colores que se dejan fuera de tokens a propósito:**

- `#25D366` — verde de marca de WhatsApp, usado solo en el hover de `.whatsapp-float`. Es un color externo al sistema: lo fija WhatsApp, no NEXOVA.
- `rgba(5,5,5,x)` — los velos del hero y del hangar. Es `--bg` con alfa.
- Las alfas del ámbar que aparecen una sola vez (`.07`, `.12`, `.15`, `.18`, `.22`, `.25`, `.30`, `.60`…) quedan literales en su regla.
- `#ef4444` sigue inline en `CostCalculator.tsx:75` (punto rojo de los tres puntos de "terminal"), además de su token en `--danger`.

**Regla dura:** el ámbar nunca va como fondo pleno detrás de texto blanco. Cuando es fondo (`.btn-gradient`), el texto pasa a `--bg`.

**Nota** — `.btn-whatsapp` es CSS muerto. Sigue en `globals.css` (líneas ~1239–1261) pero ningún componente la usa hoy. La única pieza que hoy rompe la paleta a propósito con verde de marca es `.whatsapp-float`: en reposo es vidrio gris, el verde `#25d366` solo aparece en `:hover`.

## 2. Tipografías

Se cargan como `<link>` en `app/layout.tsx` (no vía `next/font`), con `preconnect` a los tres orígenes y `preload` del woff2 de Helvetica Now Var. Las tres familias de Google Fonts viajan en una sola URL, con los nombres en orden alfabético (lo exige la API css2).

- **Helvetica Now Var** (db.onlinewebfonts.com) — fuente del body, fijada también inline en el `<body>` para evitar FOUT. Viene de un CDN de terceros, así que no se puede migrar a `next/font`.
- **Montserrat** (Google Fonts, 300–900 + itálica 400) — títulos, números, labels en mayúscula. El rango llega a 900 porque el CSS pide 800 y 900 en distintas clases.
- **Inter** (Google Fonts, 300–600) — body copy dentro de `.elegant-section`.
- **Cormorant Garamond** (Google Fonts, solo 300) — serif de los números del hero (`.num-card .number`).

**Deuda tipográfica: saldada**

| Declarada en | Familia | Resolución |
|---|---|---|
| `.num-card .number` | Cormorant Garamond | Se carga. Antes caía a Georgia, serif. |
| `.nav-logo` | Outfit | Declaración borrada. Hereda Helvetica Now Var del body. |
| `.nav-logo .tm`, `.nav-links a` | Plus Jakarta Sans | Declaración borrada. Ídem. |

**Regla:** ninguna regla puede nombrar una familia que el `<link>` no traiga.

**Escalas**

- `h1` — `clamp(48px, 7vw, 100px)`, peso 900, line-height `.95`, letter-spacing `-.03em`. El h1 del hero sobreescribe inline a `clamp(36px, 6.5vw, 84px)`.
- `h2` — `clamp(36px, 5vw, 64px)`, peso 800. Dentro de `.elegant-section` pasa a Montserrat 700 en mayúsculas.
- `h3` — `clamp(18px, 2vw, 22px)`, peso 700.
- `.lede` — `clamp(15px, 1.6vw, 18px)`, max-width 52ch, color secundario.
- `.tag-label` — 10px, letter-spacing `.28em`, mayúsculas, con borde inferior.

## 3. Componentes y patrones

**Superficies**

- `.film-grain` — grano de película + viñeta. Un único div en `layout.tsx`, primer hijo del body, 100% CSS.
- `.liquid-glass` — botón de vidrio: fondo `rgba(255,255,255,.04)`, `backdrop-filter: blur(12px)`, borde de gradiente simulado con `::before` + `mask-composite: exclude`. CTA secundario del sitio.
- `.gradient-border` — segundo borde por máscara del sistema, con `conic-gradient` que gira. **Regla dura: máximo DOS elementos en toda la página**; hoy solo lo lleva `.price-card.featured`.
- `.btn-gradient` — CTA primario: gradiente ámbar horizontal, texto `#050505`, peso 700. Se levanta 1px en hover.
- `.glass-card` — contenedor genérico de vidrio con `blur(10px)`; en hover sube el borde a `--glass-border-active`. Solo lo usan las dos tarjetas de precio.
- `.whatsapp-float` — CTA final de WhatsApp, botón flotante esquina inferior derecha. En reposo vidrio gris; en `:hover` pasa a verde de marca. Lleva un anillo `.whatsapp-float-ping` que pulsa cada 2,8s.

**Grillas de contenido (variante "v2")**

Grilla con gap 1–2px sobre fondo `rgba(255,255,255,.06)`: el gap dibuja las líneas divisorias en vez de usar border.

- `.triage-v2-strip` — tira de 3 columnas full-bleed, renderizada directo en `page.tsx`.
- `.problems-grid-v2` — 2×2, modo "ver los 4 de una" (vía de escape desde `ProblemStepper`).
- `.features-grid-v2` — 3 columnas (→2 en 900px, →1 en 560px), grilla de `OGCircleFeatures.tsx`.

**Tilt con reflejo especular (`[data-tilt]` + `TiltGrid.tsx`)**

Las tres grillas de tarjetas (`.problems-grid-v2`, `.features-grid-v2`, `.prices-container`) comparten un solo mecanismo. `TiltGrid.tsx` monta un único listener de `pointermove` delegado, throttle por `requestAnimationFrame`, y escribe `--mx`/`--my` (posición del cursor en %) y `--rx`/`--ry` (rotación derivada, máximo ±5° desde el centro).

- La tarjeta solo lleva `transform` mientras el puntero está encima. En reposo el transform es `none` a propósito.
- Entrada 0.1s lineal, salida 0.5s `cubic-bezier(.16,1,.3,1)`.
- `.feature-shine` es el reflejo especular que sigue al cursor, compartido con `.problem-card-v2::after` y `.price-card::after`.
- Desactivado entero en `pointer: coarse` y bajo `prefers-reduced-motion`.

**La linterna sobre los problemas (`[data-lantern]` + `.problem-card-v2::before`)**

Las 4 tarjetas de `.problems-grid-v2` se atenúan mientras el puntero está dentro de la grilla, y un halo que sigue al cursor devuelve el texto a opacidad plena. Es un velo (mismo color que `--surface-1` al 55%), no una opacidad directa. Piso de opacidad 45%. Fail-safe: solo corre con `(hover:hover) and (pointer:fine)` y sin `reduced-motion`.

**Piezas específicas**

- `.nav-header` — cápsula flotante `fixed`, top 16px, centrada, `blur(16px)`. Links y CTA recién en ≥1024px. Trackea el scroll de la página con `.nav-progress-boat` (un buque de carga SVG) sobre el hilo de progreso.
- `.mobile-nav-overlay` — overlay full-screen `blur(12px)`, links escalonados.
- `.calc-demo-cta-row` (`CostCalculator.tsx`) — fila con CTA "Probar Demo" que dispara el modal por `CustomEvent`.
- `.vg-demo` / `DemoModal.tsx` — el simulador real, portado de otro repo de VeGroup y remapeado a los tokens dark de este sistema. Primer modal/dialog del repo: `createPortal`, `role="dialog"`, `aria-modal`, scroll lock, foco atrapado, cierre por Escape.
- `ProblemStepper.tsx` (#problema) — secuencia de a un problema por vez con botones Sí/No (gesto, no se persiste). Salida a la grilla completa vía "Ver los 4 de una →".
- `OGCircleFeatures.tsx` (#pilares-servicio) — mobile: spotlight scroll-driven con riel lateral. Desktop: tour automático de un avión SVG sobre curva Catmull-Rom, una sola vez. Tablet (561–900px): grilla normal sin riel ni tour.
- `AmbientAudio.tsx` — toggle mute/unmute en `.nav-cta-group`, controla `<audio loop preload="none">`. Solo en desktop.
- `StoryCollapse.tsx` (#nosotros) — acordeón de timeline 2022–2025, hoy con placeholder ("Contenido próximamente.").
- `WorldClocks.tsx` (footer) — 4 relojes en tiempo real (BUE, BCN, GZH, MIA) vía `Intl.DateTimeFormat`. Punto verde si cae en horario laboral.
- `.hero-stage` — cuatro/cinco planos que responden al scroll del hero (`--hsp`). Sin parallax de puntero.
- `.hero-layer--sky` / `Moon.tsx` — luna real en Three.js con textura NASA (CC BY 4.0, atribución pendiente de confirmar). No se monta en pantallas <481px; congelada bajo `prefers-reduced-motion`.
- `.route-ticker` — marquee CSS puro con 4 ciudades (Guangzhou, Miami, Barcelona, Belgrano).
- `.hangar` — suelo de perspectiva infinita bajo el hero, grilla CSS con dos máscaras de degradado.
- `.numbers-bar` (`NumbersBar.tsx`) — 3 métricas del hero que se cuentan solas al entrar en viewport.

**`.elegant-section`**

Wrapper que envuelve todo el `<main>` desde el triage hacia abajo. Reasigna tipografías (h2/h3 y labels a Montserrat, párrafos y listas a Inter). Tenía un `opacity: .85` sobre p/li/.lede que se borró: el escalón de jerarquía lo da el alfa del color, no una capa encima.

## 4. Movimiento

No hay librería de animación ni scroll-jacking. Solo se anima `transform`, `opacity`, `filter`, `clip-path`, `background-position` y `offset-distance`. Presupuesto duro: nada se desplaza más de 24px ni rota más de 12° (salvo el barco del nav y el avión de OG Circle, excepción explícita).

- **Hero** — video de fondo servido desde CloudFront, con poster local (frame 0, 1920×1086, 80kB).
- **Scroll del hero** (`--hsp`) — resuelto por el compositor vía `animation-timeline: scroll()` donde el navegador lo soporta; fallback JS en `HeroParallax.tsx`.
- **hangar-drift** — `background-position`, no `transform`, cada 9s lineal infinito.
- **dust-a / dust-b** — deriva vertical del polvo, 52s y 88s, `transform` puro. Reutilizado en `.footer-stars`.
- La luna del hero rota con `useFrame` de `@react-three/fiber`, geometría 3D real.
- **gradient-border-spin** — el `conic-gradient` da una vuelta cada 8s lineal, sobre exactamente dos elementos.
- **Progreso de scroll del nav** (`--progress`) — mismo par CSS-first/JS-fallback que `--hsp`.
- **El avión de OG Circle** — `offset-path`/`offset-distance` durante 17s, una sola vez, solo desktop, nunca bajo `reduced-motion`.
- **num-flash** — destello ámbar de 0.6s al terminar cada contador.
- **heading-reveal + text-gradient-sweep** — reveal de h2 (0.7s) y barrido del gradiente (0.9s, 200ms de retraso).
- Grano de película no se anima a propósito (repintado full-viewport por frame sería costoso).
- `scroll-behavior: smooth` en `html`.

**Custom properties registrados (`@property`)**

| Property | syntax | inherits | Por qué |
|---|---|---|---|
| `--hsp` | `<number>` | true | Lo escribe `.hero-stage` y lo leen sus planos hijos. |
| `--angle` | `<angle>` | false | Lo consume solo el `::before` que lo declara; si heredara, hijos anidados quedarían sincronizados por accidente. |
| `--progress` | `<number>` | true | Lo escribe `.nav-header` y lo leen su `::after` y el barco; con `inherits:false` el `::after` nunca se movería. |

**Grano de película y viñeta**

Capa fija (`position: fixed; inset: 0; pointer-events: none`) que cubre todo el contenido. `z-index: 99` (no 9999, para no tapar el nav en blur). Sin `mix-blend-mode`. Receta medida (`feTurbulence` → canvas → `getImageData`, 25.600 muestras), `opacity: .032` sobre `#050505`.

**Reveal de los h2**

`clip-path: inset()` abriéndose de abajo hacia arriba + `filter: blur(4px)` que resuelve + `opacity`. Un solo mecanismo (`IntersectionObserver` + animación por tiempo, `SectionReveal.tsx`) — no `view-timeline`, porque el reveal debe pasar una sola vez. Estado por defecto VISIBLE: sin JS, los h2 quedan como los renderizó el server. Tres estados: `pending`, `in`, `done`.

**El nav como tracking del scroll**

Dos mecanismos en un solo `useEffect` de `SiteHeader.tsx`: (1) hilo de progreso ámbar + barco, vía `.nav-header::after` con `scaleX` (no `width`); (2) sección activa, un solo `IntersectionObserver` con `rootMargin -30%/-30%`, `NAV_LINKS` con 5 entradas (#problema, #pilares-servicio, #calculadora, #nosotros, #precios). #no-es-para-vos sigue sin link propio a propósito.

**Los números del hero que se cuentan solos**

6, 3 y +5 cuentan desde 0 con `easeOutExpo` (900ms), escalonados 0/120/240ms. Valor por defecto es el FINAL (fail-safe sin JS). Un solo `IntersectionObserver` sobre el contenedor.

**Degradación**

| | Desktop | Mobile / pointer coarse | prefers-reduced-motion |
|---|---|---|---|
| Hangar | grilla + deriva | grilla estática, 140px de alto | grilla estática |
| Parallax del hero | 4 planos, scroll | 4 planos, sin translateZ/scale | todo quieto, video pausado en poster |
| Luna del hero | esfera 3D real, rota | no se monta (<481px) | montada pero congelada |
| Tilt + reflejo | sigue al cursor | sin tilt, reflejo fijo | sin tilt, reflejo hover se mantiene |
| `.gradient-border` | cónico girando cada 8s | ídem | gradiente ámbar plano |
| Reveal de h2 | clip-path + blur, una vez | ídem | visibles y quietos |
| Hilo de progreso + barco | se llena con scroll | ídem | display: none entero |
| Contador de números | cuenta + flash | ídem | valores finales sin conteo |
| Linterna de "ver todos" | velo + halo | apagada | apagada |
| Riel/tour OG Circle | tour de avión una vez | riel de spotlight | ninguno, grilla completa |
| Ping de `.whatsapp-float` | pulsa cada 2.8s | ídem | apagado |

## 5. Layout y responsive

- `.wrap` — max-width 1240px, `padding-inline: clamp(20px, 5vw, 72px)`.
- `.section-pad` — `padding-block: clamp(72px, 10vw, 140px)`.
- Breakpoints en uso: 1024px (nav desktop), 940px (colapso genérico de grillas), 901px/560px (tour/riel OGCircleFeatures), 900px/560px (columnas `.features-grid-v2`), 720px (triage, calculadora, problemas), 680px (numbers bar y hangar), 640px (`.whatsapp-float`).

## 6. Estado del build

El sitio dejó de ser 100% estático. `app/api/demo/*` (identify, dolar, lead, analyze) es el primer backend propio: Claude Sonnet 5 para clasificación NCM, Haiku 4.5 para análisis de marketing (más barato, alcanza porque es redacción). Rate limiting sobre `@vercel/kv`.

- **Motor de cálculo portado, no reescrito.** `app/lib/demo/calc.js` y `ncmSearch.js` son copias literales de otro repo de VeGroup — no editar acá, cualquier cambio se hace upstream.
- **Tailwind configurado pero desactivado.** Las directivas `@tailwind` fueron removidas de `globals.css`; el markup usa CSS propio + inline.
- **Iconos** — `lucide-react` para algunos (ArrowRight, Users, Menu, X, Volume2, VolumeX); el resto son SVG inline.
- **CSS muerto sustancial:** `.bp-*` (~530 líneas, contenedor 3D de `BlueprintSteps.tsx`, componente ya no existe) y `.btn-whatsapp`. El resto de bloques v1 (`.blueprint-container`, `.calc-container`, `.triage-grid`, `.faq-container`, `.problems-grid` sin `-v2`) siguen borrados.
- **Assets en uso** (corregido respecto a revisiones previas): solo tres archivos en `public/` — `hero-poster.jpg`, `hero-theme.mp3`, `moon-2k.jpg` (NASA CC BY 4.0, atribución visible pendiente de confirmar).

## 7. Accesibilidad — puntos abiertos

**Contraste — resuelto**

Todo el texto secundario y los labels llegan a 4.5:1 (WCAG 2.1 AA), calculado componiendo el rgba real sobre el fondo real.

| Regla | Antes | Después | Fondo |
|---|---|---|---|
| `--text-muted` (`.num-card .label`) | 2.34:1 (α .28) | 4.62:1 (α .46) | `--bg` |
| `.triage-v2-sub` | 3.07:1 (α .35) | 4.62:1 (α .46) | `--bg` |
| `.triage-v2-cta` | 2.53:1 (α .30) | 4.62:1 (α .46) | `--bg` |
| `.feature-body` | 3.22:1 (α .42) | 4.50:1 (α .45) | `--surface-1` |
| `.problem-body` | 3.54:1 | 4.50:1 | `--surface-1` |
| `.lede` en `.elegant-section` | 4.07:1 | 5.30:1 | `--bg` |

Alfas mínimas de referencia para 4.5:1 con blanco puro: `--bg` → 0.4529; `--surface-1` → 0.4500; `--surface-3` → 0.4523; `--surface-2` → 0.4512.

Sin tocar: `--text-primary` (17.1:1) y el ámbar `#d99e00` sobre `--bg` (8.3:1) ya cumplían de sobra. Queda por debajo de AA, fuera de alcance: `.bp-nav-sub` (CSS muerto, sin impacto real). El contraste del Demo nuevo (`.vg-demo`, `DemoModal.tsx`) no fue auditado todavía.

**Otros**

- Los elementos decorativos llevan `aria-hidden="true"` de forma consistente.
- **Punto abierto, asumido a conciencia** — la linterna de "ver todos" en #problema. Mientras el puntero está en la grilla, el texto de las tarjetas fuera del halo baja de AA (`.problem-body` de 4.50:1 a ~1.9:1). Acotado: DOM siempre completo, piso 45%, solo mientras el puntero está en la grilla, apagado bajo `pointer:coarse`/`reduced-motion`/sin JS.
- Resuelto: el video del hero respeta `prefers-reduced-motion` (`HeroParallax.tsx` lo pausa en t=0).
- `AmbientAudio.tsx` expone `aria-pressed` y `aria-label` dinámico.
- `WorldClocks.tsx` lleva `aria-label` y `title` descriptivo por reloj.
- **Punto sin verificar:** el Demo (`DemoModal.tsx` → `AgentQuote.jsx`) no pasó auditoría de accesibilidad/contraste de su contenido interno.
- **Punto sin verificar:** no se auditó el foco de teclado del tour de `OGCircleFeatures` ni de los estados `data-og-active`/`data-lantern` con lector de pantalla real.
