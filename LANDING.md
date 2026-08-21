# Estructura de la Landing — VeGroup (OG Circle)

> Fuente: página de Plane "Fase 1 - Landing Page" (proyecto Sistema OG Circle, VGRP). Replicado desde `landing.md` del repo de la landing — última sincronización manual: 21/08/2026.

Documenta la estructura real actual de la landing (`app/page.tsx`, `app/layout.tsx`, `app/components/`): qué secciones existen, en qué orden, qué componente maneja cada una y qué mecánica interactiva real corre en cada punto. Para el detalle visual (paleta, tipografía, animación, accesibilidad) ver `DESIGN.md` — este documento es de estructura/flujo de página, no de pixel.

**Nota de historial:** la versión anterior de este documento era un plan de implementación pre-código que describía una "Tunnel Journey" 3D con zoom en el eje Z y un mapa de radar/tracking animado con una caja viajera recorriendo Guangzhou/Miami → Argentina. Nada de eso llegó a implementarse tal cual — no existe ningún componente de túnel 3D ni de radar en el repo. Este documento describe lo que efectivamente se construyó.

**Segunda pasada (esta revisión):** la sección "Calculadora" (§2.6) dejó de ser el simulador client-side de fórmulas fijas que describían las revisiones anteriores. Se reemplazó por un "Demo" real portado del cotizador propio de VeGroup, con IA (clasificación NCM + análisis de marketing vía Anthropic), cotización de dólar en vivo y captura de lead propia — y trajo consigo el primer backend (`app/api/demo/*`) y el primer modal (`DemoModal.tsx`) de todo el repo. Ver §2.6 y §5 para el detalle.

## 1. Qué es

Landing de una sola página (`app/page.tsx`, Next.js App Router, sin routing) que vende **OG Circle**, el curso + red de contactos de VeGroup para importar desde China/Miami/España y armar un e-commerce en Argentina. `page.tsx` es un server component que compone secciones; toda pieza interactiva vive en `app/components/` como client component (`'use client'`). Copy en es-AR.

## 2. Secciones, en orden de documento

Todas las secciones de `#id` viven dentro de `<main id="top">`, envueltas (desde el triage en adelante) por `<div className="elegant-section">`.

| # | Sección | id | Componente(s) | Link en nav |
|---|---|---|---|---|
| 1 | Hero | (ninguno — es el tope de la página) | HeroParallax, NumbersBar, Moon (dynamic, ssr:false) | — (#top en logo/footer) |
| 2 | Triage — "los tres perfiles" | (ninguno) | inline en page.tsx (`.triage-v2-strip`) | — |
| 3 | Marquee de rutas | (ninguno, aria-hidden) | inline en page.tsx, CSS puro (`.route-ticker`) | — |
| 4 | El Problema | #problema | ProblemStepper | ✅ "El Problema" |
| 5 | OG Circle / Pilares | #pilares-servicio | OGCircleFeatures | ✅ "OG Circle" |
| 6 | Demo | #calculadora | CostCalculator (CTA) → DemoModal → DemoFlow/AgentQuote (dynamic, ssr:false) | ✅ "Demo" |
| 7 | Quiénes Somos | #nosotros | StoryCollapse (+ placeholder de foto) | ✅ "Nosotros" |
| 8 | No es para vos | #no-es-para-vos | inline en page.tsx (`.disqualify-list`) | ❌ sin link (a propósito) |
| 9 | Precios | #precios | TiltGrid + dos `.price-card` inline | ✅ "Niveles" |
| 10 | FAQ | (sin id propio — el h2 es "Preguntas Frecuentes") | FaqList | — |
| 11 | Footer | (fuera de main) | WorldClocks, `.footer-stars` | — |

Flotante sobre todo lo anterior, fuera del flujo de secciones: `SiteHeader` (nav fijo) y `WhatsAppFloat` (CTA flotante esquina inferior derecha). `SectionReveal` tampoco es una sección — es un componente sin render que activa el reveal de los h2 de `.elegant-section` (ver `DESIGN.md` §4).

### 1. Hero

Video de fondo a pantalla completa (remoto, CloudFront, con poster local como fallback), h1 con el copy principal ("Aprendé a importar de China, Miami o España y armar tu e-commerce en Argentina"), un CTA (#problema) y una barra de 3 métricas (NumbersBar: 6 agentes verificados en China / 3 depósitos / +5 profesionales). Encima del video, en un plano intermedio, la luna 3D (`Moon.tsx`, Three.js) con tres cometas CSS. Debajo del hero, un "hangar" de perspectiva CSS pura (grilla de piso infinita) hace de transición hacia el resto de la página. Todo el parallax de scroll lo maneja `HeroParallax.tsx` (sin render propio, solo efectos).

### 2. Triage

Tres columnas (`.triage-v2-strip`) con una frase-perfil cada una — "Nunca importé nada" / "Ya importé y me fue mal" / "Importo y quiero escalar" — cada una linkeando a la sección más relevante para ese perfil (#nosotros, #problema, #pilares-servicio respectivamente). Es la única pieza de la página que actúa como router interno según quién sea el visitante.

### 3. Marquee de rutas

Ticker horizontal infinito (`.route-ticker`, decorativo, aria-hidden) con las 4 plazas que menciona el copy del sitio: Guangzhou (China), Miami (Florida · USA), Barcelona (España) y Belgrano (CABA · Argentina).

### 4. El Problema (#problema)

`ProblemStepper.tsx`: por defecto muestra los 4 problemas de a uno ("No sabés cuánto te sale realmente", "No sabés en quién confiar", "No sabés cómo pagarles", "¿Y ahora dónde lo vendés?"), con botones Sí/No que solo sirven para avanzar (no se persiste la respuesta). Al llegar al 4°, cierre con CTA a #pilares-servicio. Tiene una vía de escape ("Ver los 4 de una →") que muestra los 4 problemas juntos en grilla, con el efecto de "linterna" que sigue al cursor.

### 5. OG Circle / Pilares (#pilares-servicio)

`OGCircleFeatures.tsx`: grilla de 6 tarjetas (Cursos Explicativos, Calculadora de Costos, Depósitos Propios, Agentes en China, Red de Profesionales, Tracking en Tiempo Real). En mobile, un riel lateral hace spotlight de la tarjeta que cruza el centro del viewport al hacer scroll; en desktop, un avión anima un recorrido guiado por las 6 tarjetas una sola vez al entrar la sección en pantalla.

### 6. Demo (#calculadora)

Ya no es la calculadora client-side con fórmulas fijas de versiones anteriores — se reemplazó por completo por un simulador real, portado del cotizador propio de VeGroup (`emilianoverabusiness-blip/vegroup`, commit `5bbca48`), con IA y backend propio.

- **CostCalculator.tsx** — ya no renderiza ningún formulario: es solo una fila de CTA (#calculadora) con el texto "Probá el simulador de costos real, gratis" y un botón "Probar Demo" que dispara un `CustomEvent` (`vegroup:open-demo`) en vez de navegar.
- **DemoModal.tsx** — el primer modal/dialog del repo (`createPortal` a `document.body`, `role="dialog"`, `aria-modal`). Se abre/cierra por el mismo `CustomEvent`, con scroll lock, foco atrapado (Tab/Shift+Tab), cierre con Escape y devolución de foco al disparador al cerrar. El contenido interno (DemoFlow, y dentro AgentQuote — 717 + 772 líneas) se carga con `next/dynamic({ ssr: false })`, mismo patrón que `Moon.tsx`.
- **AgentQuote.jsx** orquesta el flujo: el usuario elige régimen de importación (general / pequeños envíos / integral), describe el producto en lenguaje coloquial ("zapas", "compu", "celu"…) y un endpoint de IA lo clasifica en una posición arancelaria NCM real. Con FOB, peso, unidades y dimensiones, calcula el costo puesto en destino para las 3 rutas reales de VeGroup (Miami, Barcelona, Guangzhou/China), usando el motor `lib/demo/calc.js`, copia literal del motor de cálculo del cotizador madre (réplica celda a celda de la planilla `COTIZADOR_VEGROUP.xlsx`).
- **RouteBreakdown.jsx** muestra el desglose de costos de la ruta elegida (y las otras dos como referencia) — mismo orden de líneas que la planilla original.
- **PriceStrategy.jsx** toma el costo puesto en mano y sugiere canal de venta y precio para lograr el margen buscado.
- **LeadGate.jsx** — pide nombre + WhatsApp con un formulario propio (no wa.me) antes de destrabar el análisis de marketing. Es la única puerta de contacto no-WhatsApp de todo el sitio.
- **MarketingAnalysis.jsx** — solo se monta con el lead ya cargado; pide a la IA (Claude Haiku 4.5) público objetivo, ángulos de venta, ideas de contenido, campaña sugerida, rango de precio y riesgo principal.

**Backend real (`app/api/demo/*`):**

| Ruta | Qué hace |
|---|---|
| `POST /api/demo/identify` | Busca candidatos NCM por texto (`lib/demo/ncmSearch.js`, base local de 4,3MB) y le pide a Claude Sonnet 5 que elija la posición exacta interpretando la jerga del usuario. Si la IA falla o la cuota está agotada, degrada al mejor match de la búsqueda local — nunca devuelve 500 por una falla de IA. |
| `POST /api/demo/dolar` | Cotización oficial del dólar (BNA, vía dolarapi.com), cacheada 10 min por instancia. |
| `POST /api/demo/lead` | Guarda nombre + WhatsApp del visitante (hash de IP, no la IP en crudo) y marca la sesión como con-lead. |
| `POST /api/demo/analyze` | El análisis de marketing con IA. Exige lead capturado (403 si no) — es la contraprestación de la demo, no una medida de seguridad. |

Rate limiting propio (`lib/demo/ratelimit.ts`): identidad doble (cookie httpOnly firmada + hash de IP), respaldada por `@vercel/kv` en producción. El límite por visitante es UX, no seguridad — el tope real es un cupo global diario que acota el gasto en la API de Anthropic.

### 7. Quiénes Somos (#nosotros)

Copy de fundadores (VeGroup como "importador con años de trayectoria operando fletes internacionales entre Asia, Europa y Argentina" — es narrativa de marketing del sitio, no necesariamente una descripción literal del modelo de negocio) + `StoryCollapse.tsx`, un acordeón "Ver la historia completa" con una timeline 2022–2025 que hoy tiene contenido placeholder ("Contenido próximamente." en las 4 entradas). Al lado, un placeholder visual para la foto de los fundadores (ícono Users de lucide-react, sin imagen real).

### 8. No es para vos (#no-es-para-vos)

Lista de 3 descalificadores (traer 2kg para uso personal → deriva a WhatsApp; esperar ganar sin capital, mínimo real USD 800–1.000; vivir fuera de Argentina). Sección sin link en el nav a propósito.

### 9. Precios (#precios)

Dos planes con pago único (no suscripción): **Principiante** ($75.000 ARS: formación completa, calculadora, acceso a red, soporte financiero básico) y **Avanzado** ($125.000 ARS, destacado con `.gradient-border`: todo lo de Principiante + acceso a depósitos en Miami/China/España, agente de muestras y volumen, flete + despacho gestionado por VeGroup, tracking internacional y cuenta cambiaria SWIFT). Nota de upgrade: se puede pasar de Principiante a Avanzado pagando la diferencia + $10.000. Ambas tarjetas usan `TiltGrid` para el efecto de inclinación 3D con el cursor.

### 10. FAQ

`FaqList.tsx`: acordeón de 4 preguntas fijas + un ítem extra "¿Tenés otra pregunta?" que abre un textarea y manda la pregunta por WhatsApp (wa.me) con un mensaje pre-armado.

### 11. Footer

Fuera de `main`, con fondo `.footer-stars` (el mismo campo de estrellas del hero, reutilizado). Contiene: logo "OG CIRCLE by VeGroup" (ancla a #top) + copyright, `WorldClocks.tsx` (4 relojes en vivo: Buenos Aires, Barcelona, Guangzhou, Miami — con indicador de horario laboral para Guangzhou/Barcelona/Miami), y datos de contacto (dirección en Amenábar 2049, Belgrano, CABA; teléfono/WhatsApp; Instagram).

## 3. Piezas fuera del flujo de secciones

- **SiteHeader.tsx** — nav fijo (`position: fixed`, siempre montado). Desktop (≥1024px): logo, 5 links (#problema, #pilares-servicio, #calculadora, #nosotros, #precios), toggle de audio ambiental (AmbientAudio) y CTA "Quiero Aprender". Mobile: logo + hamburguesa que abre un overlay full-screen con los mismos links + CTA de WhatsApp. El nav trackea el scroll de la página entera con un hilo de progreso ámbar y resalta la sección activa.
- **AmbientAudio.tsx** — toggle mute/unmute de una pista de audio ambiental (`/audio/hero-theme.mp3`), visible solo en el grupo de CTA de escritorio del nav. No hay control de audio en mobile.
- **WhatsAppFloat.tsx** — botón flotante fijo en la esquina inferior derecha, siempre visible, que abre WhatsApp con un mensaje pre-armado ("Tengo una duda sobre OG Circle"). Es un CTA discreto, independiente de los CTAs de cada sección.
- **SectionReveal.tsx** — sin render propio; activa el reveal (fade + clip-path) de los h2 de `.elegant-section` la primera vez que cada uno entra en viewport.

## 4. Mensaje de WhatsApp compartido

Hay dos plantillas de mensaje de WhatsApp distintas en el código, no una sola:

- `WHATSAPP_MESSAGE` en `page.tsx` (usada por los CTAs de precios y el link de "2kg para uso personal"): "Hola, vengo de la web de VeGroup.\nProducto:\nDesde: China / Miami / España\nPeso aproximado: ".
- `WHATSAPP_MESSAGE` en `SiteHeader.tsx` (usada solo por el CTA "Iniciar operación" del menú mobile) — mismo texto, duplicado literal en el componente en vez de importado desde un módulo compartido.
- `WhatsAppFloat.tsx` y `FaqList.tsx` tienen, cada uno, su propio mensaje distinto ("Tengo una duda sobre OG Circle: " y "Tengo una pregunta que no está en las FAQ:" respectivamente).

El número de WhatsApp (`5491176392303`) sí está repetido igual en los cuatro lugares. Si el número o el mensaje default cambian, hay que tocar los cuatro archivos — no hay un único punto de verdad.

## 5. Lo que NO existe (aclarado por si se busca en el código)

- No hay ningún componente de "túnel 3D" / zoom en eje Z ni bloqueo de scroll en ninguna sección — todo el scroll es vertical normal, sin scroll-jacking.
- No hay mapa de radar/tracking ni "caja viajera" recorriendo una ruta geográfica. El componente más cercano en espíritu es el avión animado de OGCircleFeatures (recorre 6 tarjetas de features, no una ruta geográfica) y el buque de carga del nav (decorativo, viaja sobre la barra de progreso de scroll, no sobre un mapa).
- No hay formulario de lista de espera para acceso anticipado ni newsletter. Sí hay, desde el rediseño del Demo, un formulario propio de captura de lead (nombre + WhatsApp, `LeadGate.jsx` → `POST /api/demo/lead`) — es la excepción puntual a "todo pasa por wa.me", acotada al flujo del simulador.
- El sitio sí tiene backend propio hoy: cuatro rutas bajo `app/api/demo/*` (identificación NCM y análisis de marketing vía Anthropic, cotización de dólar, captura de lead), con rate limiting sobre `@vercel/kv`. Es exclusivo del Demo — el resto de la landing (hero, precios, FAQ, etc.) sigue siendo 100% estático/client-side, sin llamadas a ningún servidor propio.
