# Requirements: VGRP-33 — Perfil del usuario y soporte por WhatsApp

**Status:** Draft
**Last updated:** 2026-09-12

## Summary

Tercer ticket del Bloque 8. Ruta nueva `/perfil` (hoy 404 — VGRP-27 la dejó marcada
explícitamente como "no construida todavía"). A diferencia del dashboard, `/perfil`
**no** está bajo la restricción de shell estático: no usa `generateStaticParams`, así
que puede ser un Server Component dinámico normal (mismo criterio que `/admin/*`),
sin la gimnasia de Client Component + fetch-post-hidratación que sí hace falta dentro
de `InicioShell`.

Cubre 1 work item del Epic "Fase 2 — MVP para cobrar" (proyecto VGRP en Plane):

- **VGRP-33** — Perfil del usuario y soporte por WhatsApp.

## Goals

- `/perfil`: datos del usuario (nombre, email, teléfono, nivel activo).
- Edición de nombre/teléfono (Server Action con Zod, mismas reglas de validación que
  `registroSchema` en `app/(auth)/_schemas.ts` — no se reinventan).
- Listado de accesos habilitados según el nivel real, y de los que sumaría el nivel
  superior (contenido estático, fuente: PRD §1.1 — ver Decisiones).
- Accesos rápidos: "Mis envíos" y "Documentos" como próximamente (Fase 3); cerrar
  sesión (reusa `cerrarSesion()`, ya existente).
- Soporte: link a `wa.me` con el número desde Edge Config (`getLinks().whatsapp`, ya
  implementado por VGRP-39).

## Non-goals

- **Flujo de upgrade con pago de diferencia.** El PRD lo marca explícitamente fuera de
  alcance de Fase 2 ("Flujo de upgrade entre niveles — Fase 3"). El CTA para un nivel
  superior manda a `/comprar` (precio completo, mismo checkout que cualquiera), no a un
  flujo de "pagar la diferencia".
- **Módulo de envíos/documentos real.** Fase 3, según el roadmap — quedan como
  "próximamente", sin ninguna tabla ni query nueva.
- **API de WhatsApp.** Decisión ya cerrada (MODULOS.md §6): sólo un link a `wa.me`.

## User stories

### US-1: Perfil coherente con el nivel real

**Acceptance criteria:**

- THE SYSTEM SHALL mostrar `profiles.nivel` (leído en el servidor, con
  `getVerifiedClaims()`/el cliente RLS — nunca un valor cacheado o de props heredadas)
  como el nivel activo.
- WHEN `nivel = 'ninguno'` THE SYSTEM SHALL mostrar un perfil coherente (nombre/email/
  teléfono editables, soporte, cerrar sesión) con un CTA de compra en el lugar donde
  iría la lista de accesos — nunca una lista vacía sin explicación.

### US-2: Editar nombre y teléfono, nunca nivel ni rol

**Acceptance criteria:**

- THE SYSTEM SHALL permitir editar `nombre`/`telefono` vía un Server Action validado
  con Zod (mismas reglas que el registro).
- THE SYSTEM SHALL NOT incluir `nivel` ni `rol` en el payload de esa mutación bajo
  ninguna circunstancia — determinado por dos capas: el código del Server Action nunca
  los toca, y el grant de Postgres (`grant update (nombre, telefono, progreso)`,
  `init_plataforma.sql`) ni siquiera permite escribirlos aunque el código tuviera un
  bug — confirmado leyendo la migración, no asumido.

### US-3: Accesos habilitados / lo que desbloquea el nivel superior

**Acceptance criteria:**

- WHEN `nivel = 'principiante'` THE SYSTEM SHALL listar lo que ya tiene (formación
  completa, calculadora, profesionales, servicios financieros) y, aparte, lo que
  sumaría Avanzado (depósitos Miami/China/España, agente de muestras y volumen, flete y
  despacho gestionado, tracking marítimo, SWIFT), con un CTA a `/comprar`.
- WHEN `nivel = 'avanzado'` THE SYSTEM SHALL listar todo sin ningún upsell (ya tiene el
  nivel máximo).

### US-4: Soporte y cierre de sesión

**Acceptance criteria:**

- THE SYSTEM SHALL linkear a `getLinks().whatsapp` (Edge Config) — cambiarlo ahí lo
  cambia sin deploy, sin tocar código.
- THE SYSTEM SHALL reusar `cerrarSesion()` (`lib/auth/actions.ts`, ya existente) para
  cerrar sesión — no se reimplementa el logout.

## Decisiones asumidas (2026-09-12)

- **Contenido de "accesos habilitados"**: sacado literal de la PRD "Fase 2 — MVP para
  cobrar" §1.1 ("Niveles y precios"), no inventado:
  - Principiante — Formación completa (11 videos), calculadora, profesionales,
    servicios financieros.
  - Avanzado — Todo lo de Principiante + depósitos Miami/China/España, agente de
    muestras y de volumen, flete y despacho gestionado, tracking, marítimo, SWIFT.
  - Esta misma fuente **responde también la duda abierta de VGRP-32** (¿servicios
    financieros es de ambos niveles y SWIFT sólo de Avanzado?): sí — "servicios
    financieros" está en la lista de Principiante, SWIFT sólo aparece en el "+" de
    Avanzado. Documentado acá porque es la primera vez que se lee esta sección de la
    PRD con ese detalle; VGRP-32 la reutiliza en vez de esperar la respuesta de Jota
    (que igual sigue en curso, por las dudas la PRD esté desactualizada).
- **`/perfil` es un Server Component dinámico normal**, no una pieza estática con
  fetch-post-hidratación — no está sujeto a la regla de shell estático de VGRP-27
  (esa regla es específica de `/dashboard/[variante]`, que usa
  `generateStaticParams`). Mismo criterio que `/admin/*` o `/comprar`.
