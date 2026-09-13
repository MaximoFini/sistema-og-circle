# Tasks: VGRP-33 — Perfil del usuario y soporte por WhatsApp

**Status:** Implementado, pendiente `/simplify` + `/design-critique` + PR
**Last updated:** 2026-09-12
**Requirements:** [requirements-vgrp33.md](./requirements-vgrp33.md)

- [x] **33-T1 — `app/(app)/perfil/page.tsx` (Server Component dinámico)**
  Satisfies: US-1, US-3
  Notes: no usa `generateStaticParams` (a diferencia de `/dashboard/[variante]`), así
  que puede leer `getVerifiedClaims()`/`profiles` directo sin la gimnasia de Client
  Component + fetch-post-hidratación — mismo criterio que `/admin/*`/`/comprar`.
  `pnpm build` confirma que sale como `ƒ` (dinámica), como corresponde. Lista de
  accesos por nivel (`ACCESOS_PRINCIPIANTE`/`ACCESOS_AVANZADO_ADICIONALES`) sacada
  literal de la PRD §1.1, no inventada.

- [x] **33-T2 — Edición de nombre/teléfono**
  Satisfies: US-2
  Notes: `_schemas.ts` (mismas reglas que `registroSchema`) + `_actions.ts`
  (`actualizarPerfil`, `"use server"`, `createSupabaseServerClient()` — RLS, no service
  role) + `PerfilForm.tsx` (mismo patrón `useActionState` que `RegistroForm`).
  `nivel`/`rol` nunca están en el payload — confirmado además que el grant de Postgres
  (`init_plataforma.sql`) ni siquiera permite escribirlos desde `authenticated`, doble
  barrera.

- [x] **33-T3 — Accesos rápidos + soporte + cerrar sesión**
  Satisfies: US-4
  Notes: "Mis envíos"/"Documentos" como próximamente (sin query, Fase 3). Soporte:
  `getLinks().whatsapp` (Edge Config, ya implementado por VGRP-39), `target="_blank"`.
  Cerrar sesión reusa `cerrarSesion()` (`lib/auth/actions.ts`) — no se reimplementa.

- [x] **33-T4 — Verificación real**
  Notes:
  - `pnpm typecheck` ✅, `pnpm lint` ✅, `pnpm build` ✅ (`/perfil` → `ƒ`,
    `/dashboard/[variante]` sigue `●`).
  - **Browser real, los 3 niveles:**
    - `nivel='ninguno'`: perfil coherente (datos editables, sin lista de accesos, CTA
      "Comprar acceso" en su lugar), sin nada roto.
    - `nivel='principiante'`: lista de 4 accesos propios + "Avanzado suma, además" (5
      ítems) + CTA "Mejorar mi nivel" → `/comprar`.
    - `nivel='avanzado'`: lista completa (9 ítems), sin ningún upsell.
  - Edición de nombre/teléfono probada de punta a punta: guardado confirmado por SQL
    directo (`nombre`/`telefono` actualizados, `nivel`/`rol` intactos), dato de prueba
    revertido al terminar.
  - Link de WhatsApp confirmado con `target="_blank"`/`rel="noopener noreferrer"` y el
    número de fallback de Edge Config.
  - Cerrar sesión confirmado: redirige a `/login` de verdad.
  - Mobile (375×812): sin overflow horizontal, todo legible.
  - El link "Perfil" del drawer de navegación (`components/nav/destinos.ts`, ya
    apuntaba a `/perfil` desde VGRP-27) ya no da 404.
