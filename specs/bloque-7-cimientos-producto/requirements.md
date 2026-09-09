# Requirements: VGRP-27 — Shell del dashboard y navegación por drawer (Bloque 7)

**Status:** Draft
**Last updated:** 2026-09-07

## Summary

Primer ticket del Bloque 7 ("Los cimientos del producto"). Construye el **molde** de la
pantalla Inicio del dashboard — header con menú hamburguesa, drawer de navegación y las
secciones de Inicio como slots vacíos en el orden correcto — todavía sin datos reales
adentro. No es la pantalla final: habilita a VGRP-30 (gating), VGRP-38 (panel admin de
contenido) y VGRP-29 (VideoProvider + grillas) a construirse sobre una estructura que ya
existe, en vez de agregarla después a seis pantallas.

Cubre 1 work item del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-27** — Shell del dashboard y navegación.

## Goals

- Que exista un header con botón de menú (hamburguesa) que abra un drawer de navegación
  lateral con los 5 destinos de la plataforma: Inicio, Calculadora, Comunidad, Tracking,
  Perfil (MODULOS.md §8).
- Que la pantalla Inicio muestre, en el orden de MODULOS.md §2, un slot vacío por cada
  sección futura (Stage 1, banner calculadora, Stage 2, directorio de agentes, banner
  comunidad, profesionales, servicios financieros), sin contenido real todavía.
- Que Comunidad y Tracking aparezcan como destinos visibles del drawer marcados
  "Próximamente" — nunca como link roto ni 404.
- Que el shell (header + layout de Inicio) siga estático/prerenderizado, siguiendo el
  patrón ya documentado en `app/(app)/layout.tsx` (Server Component sin cookies; lo que
  varía por usuario/nivel se resuelve en un Client Component chico dentro de
  `<Suspense>`) — no se vuelve a discutir esa decisión, se implementa.
- Que el drawer sea usable por teclado y lector de pantalla: foco atrapado mientras está
  abierto, cierre con Escape, y foco devuelto al botón que lo abrió al cerrar — mismo
  patrón que `DemoModal.tsx` (primer diálogo del repo: `createPortal`, `role="dialog"`,
  `aria-modal`, scroll lock, foco atrapado).
- Que el shell funcione en mobile (el drawer es el único patrón de navegación — no hay
  sidebar fija en ningún breakpoint, MODULOS.md §8).
- Que todo el estilo nuevo use CSS Modules consumiendo los custom properties de
  `app/tokens.css` (nunca valores hardcodeados de color/espaciado/radio).

## Non-goals

- **Contenido real de las secciones** (videos, agentes, profesionales, servicios) — eso
  es VGRP-29 (grillas) y depende de datos que VGRP-38 todavía no creó.
- **El candado por nivel** (qué se ve bloqueado y qué no para cada nivel) — es VGRP-30, el
  ticket siguiente en la cadena. Este ticket deja los slots preparados para que VGRP-30
  los envuelva, pero no implementa la lógica de bloqueo en sí.
- **Pantallas de Calculadora, Comunidad, Tracking y Perfil** — el drawer linkea a ellas
  (o las marca "Próximamente"), pero construir esas pantallas es de otros tickets /
  bloques posteriores.
- **El ticker superior de depósitos/CUIT** de MODULOS.md §2 — ver "Open questions" abajo.
  Es explícitamente Fase 3 según PRD Fase 2 §2.2.
- **Panel de administración** (VGRP-38, gestión de precios VGRP-40) — no forma parte de
  este ticket.

## User stories

### US-1: Header con menú hamburguesa

Como usuario logueado, quiero un botón de menú siempre visible que abra la navegación,
para poder moverme por la plataforma desde cualquier pantalla.

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar un header persistente en todas las pantallas de `(app)` con un
  botón de menú (hamburguesa).
- WHEN el usuario activa el botón de menú (click, Enter o Space) THE SYSTEM SHALL abrir el
  drawer de navegación.
- THE SYSTEM SHALL renderizar el header como parte del shell estático de `(app)` — el
  botón en sí no depende de datos por-usuario.

### US-2: Drawer de navegación accesible

Como usuario, quiero un panel lateral con los 5 destinos de la plataforma que se maneje
igual de bien con mouse, teclado o lector de pantalla.

**Acceptance criteria:**

- WHEN el drawer está abierto THE SYSTEM SHALL listar los 5 destinos en este orden:
  Inicio, Calculadora, Comunidad, Tracking, Perfil (MODULOS.md §8).
- WHEN el drawer está abierto THE SYSTEM SHALL atrapar el foco de teclado dentro de él
  (Tab/Shift+Tab no debe poder salir al contenido de atrás).
- WHEN el usuario presiona Escape con el drawer abierto THE SYSTEM SHALL cerrarlo y
  devolver el foco al botón que lo abrió.
- WHEN el usuario hace click fuera del drawer (en el overlay) THE SYSTEM SHALL cerrarlo.
- THE SYSTEM SHALL marcar el drawer con `role="dialog"` y `aria-modal="true"`, siguiendo
  el patrón ya usado por `DemoModal.tsx`.
- WHILE el drawer está abierto THE SYSTEM SHALL bloquear el scroll del contenido de atrás.
- IF un destino del drawer todavía no tiene pantalla construida (Comunidad, Tracking)
  THEN THE SYSTEM SHALL mostrarlo visible pero marcado "Próximamente", sin navegar a un
  404 ni deshabilitarlo silenciosamente sin explicación.
- THE SYSTEM SHALL renderizar y ocultar el drawer sin herramientas adicionales a las ya
  usadas en el repo (`createPortal`, CSS Modules) — no se agrega ninguna librería nueva de
  UI/diálogos sin decisión explícita (ver Constraints).

### US-3: Pantalla Inicio con slots vacíos en el orden correcto

Como usuario, quiero ver la estructura completa de mi pantalla principal desde ya, aunque
el contenido todavía no esté cargado, para entender qué va a tener la plataforma.

**Acceptance criteria:**

- THE SYSTEM SHALL renderizar en `/dashboard` (o la ruta que reemplace a la actual, a
  confirmar en design.md) un slot por cada sección de MODULOS.md §2, en este orden: Stage
  1, banner de calculadora, Stage 2, directorio de agentes de compra, banner de comunidad,
  profesionales al servicio, servicios financieros.
- THE SYSTEM SHALL renderizar cada slot vacío con una indicación visual de qué sección va
  a ir ahí (placeholder con título de sección), nunca como espacio en blanco sin
  explicación.
- THE SYSTEM SHALL NOT incluir el ticker superior de depósitos/CUIT como slot de esta
  pantalla (ver Open questions).

### US-4: Dos variantes de nivel, prerenderizadas — más el estado `ninguno` ya existente

Como usuario Principiante o Avanzado, quiero que mi pantalla principal salga ya construida
(sin esperar una consulta a la base), y que se vea la variante que corresponde a mi nivel.

**Texto del ticket (VGRP-27):** *"Se prerenderiza en sus dos variantes de nivel para que
salga del CDN"* / *"Shell estático en sus dos variantes de nivel"*. Confirmado contra
Plane: son **dos variantes prerenderizadas — Principiante y Avanzado** (qué slots se ven
"más" desbloqueados en cada una), no un cálculo dinámico de 3 estados en cada visita.

**Acceptance criteria:**

- THE SYSTEM SHALL prerenderizar dos variantes estáticas del shell de Inicio, una para
  `nivel = 'principiante'` y otra para `nivel = 'avanzado'`, sin que elegir cuál servir
  dispare una query a `profiles` (se resuelve por claim/routing, a definir en design.md).
- WHEN el nivel del usuario es `ninguno` THE SYSTEM SHALL preservar el comportamiento
  actual de `app/(app)/dashboard/page.tsx` (pantalla de "comprá un nivel" con CTA a
  `/comprar`) — es un caso aparte, ya construido en VGRP-18, no una tercera "variante" del
  shell de este ticket, y es el estado más común (ver comentario VGRP-18 en ese archivo).
- THE SYSTEM SHALL leer cualquier dato por-usuario (para decidir qué variante o para
  contenido que sí varíe dentro de la variante) desde un Client Component chico dentro de
  `<Suspense>`, nunca desde el Server Component del layout raíz de `(app)` — mismo patrón
  ya documentado en el comentario de `app/(app)/layout.tsx` (líneas 11-40).

## Constraints

- **Stack fijo:** Next.js 15 App Router (React 19, TS strict), CSS Modules con los tokens
  de `app/tokens.css` (dark cinematic, sin Tailwind). No se agregan librerías de UI/drawer
  sin decisión explícita — `lucide-react` ya está en el repo si hace falta un ícono de
  menú/cierre.
- **Shell estático, gating por claim:** `app/(app)/layout.tsx` NO debe leer cookies ni
  llamar a `getVerifiedClaims()` / `createSupabaseServerClient()` directamente (se
  volvería dinámico). El patrón obligatorio para contenido por-nivel es un Client
  Component dentro de `<Suspense>`, tal como ya está documentado en ese archivo.
- **Middleware ya resuelve sesión:** para cuando este shell corre, `middleware.ts` ya
  garantizó que hay sesión válida (fail-closed, ver ese archivo). Este ticket no toca
  `middleware.ts`.
- **Sin roundtrip a la base para decidir qué mostrar:** todo lo que dependa del nivel se
  lee del claim `app_metadata.nivel` del JWT (`getNivel()`), nunca de una query a
  `profiles`.
- **Reutilización de primitivas:** cualquier UI compartida nueva (botones, links) sale de
  o se agrega a `components/ui/` (`Button`, `TextLink`, etc.), no se duplica.
- **Patrón de diálogo accesible — no hay precedente en ESTE repo:** `DemoModal.tsx`
  (`createPortal`, `role="dialog"`, `aria-modal`, scroll lock, foco atrapado, cierre por
  Escape) documentado en `DESIGN.md` pertenece a la **landing pública**, que vive en un
  repo/deploy separado (`app/(app)/layout.tsx` lo aclara explícitamente) — no existe en
  `sistema-og-circle`. Se toma como referencia de qué prácticas seguir (mismo mecanismo:
  `createPortal`, `role="dialog"`, `aria-modal`, scroll lock, foco atrapado, cierre por
  Escape), pero el drawer de VGRP-27 es el **primer diálogo/overlay accesible construido
  en este repo** — no hay código propio para importar ni copiar.
- **El prototipo es solo referencia visual:** `inicio-proyecto/app-preview_7.html` sirve
  para entender estructura y flujo — el ticket aclara explícitamente que no es código para
  copiar.
- **CI en verde:** typecheck + `biome ci` + build + Vitest + Playwright. El drawer necesita
  al menos un test de accesibilidad (foco atrapado, cierre por Escape) y un test e2e de
  que los 5 destinos navegan o muestran "Próximamente" según corresponda.
- **Entrega:** rama + PR para VGRP-27. `/simplify` antes de la PR; `/design-critique` sobre
  el shell nuevo (header, drawer, pantalla Inicio); `/design-system` si se agregan o
  modifican primitivas de `components/ui`.

## Open questions

- **Contradicción del ticker (a resolver con Jero antes de armar el layout final):**
  MODULOS.md §2 (doc general, pre-PRD) lista el ticker de depósitos/CUIT como primer
  elemento de Inicio. CONTEXT.md — Roadmap, Fase 3 lo lista explícitamente ahí ("Ticker
  superior con depósitos/CUIT..."), fuera de Fase 2. El texto de VGRP-27 no menciona el
  ticker ni para incluirlo ni para excluirlo — sólo dice "según el orden de MODULOS.md
  §2", así que la contradicción sigue en pie y no la resuelve el ticket por sí solo.
  **Decisión de esta versión del spec: no se incluye el ticker como slot** (Non-goals +
  US-3), siguiendo el roadmap de fases (fuente más específica) por sobre MODULOS.md. Si
  Jero prefiere dejar el slot reservado vacío para no reacomodar el layout en Fase 3, es un
  cambio de una línea en design.md, no bloquea empezar.
- **Ruta real de "Inicio":** hoy existe `app/(app)/dashboard/page.tsx`. A confirmar en
  design.md si este ticket reescribe ese mismo archivo/ruta o si "Inicio" vive en una ruta
  nueva y `/dashboard` pasa a ser un redirect. Impacta `middleware.ts` sólo si cambia el
  prefijo (hoy no está en `PUBLIC_*`, así que cualquier ruta privada nueva ya nace
  cubierta por el fail-closed existente — no hace falta tocar ese archivo).
- **Mecanismo exacto de las "dos variantes prerenderizadas":** confirmado contra el texto
  de VGRP-27 que son 2 variantes (Principiante/Avanzado), no 3 estados calculados en cada
  visita (ver US-4). Falta decidir en design.md CÓMO se sirve la variante correcta sin
  query: candidatos son un rewrite de middleware por claim hacia una de dos rutas
  pre-generadas, o `generateStaticParams` con selección server-side barata. Se define al
  escribir design.md.
- **Nombre final de los slots / copy de "Próximamente":** no hay copy definido todavía
  para los placeholders de sección ni para el estado "Próximamente" del drawer — queda
  para design.md o para que lo defina quien haga `/design-critique`.
