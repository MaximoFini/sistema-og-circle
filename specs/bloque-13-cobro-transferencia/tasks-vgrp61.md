# Tasks: Desactivar Mercado Pago sin borrar la integración (VGRP-61)

**Status:** In progress (aprobado 2026-10-02)
**Last updated:** 2026-10-02
**Design:** [design-vgrp61.md](./design-vgrp61.md) · **Requirements:** [requirements-vgrp61.md](./requirements-vgrp61.md)
**Rama:** `feat/vgrp-61-desactivar-mercadopago` (sale de `fix/merge-plan-unico-auditoria-mp`, PR #35)

Las tareas están ordenadas por dependencia. Se tildan a medida que se terminan.

- [x] **T1 — Flag en el schema y en los defaults.**
  `lib/config/schema.ts`: `mercadopago_habilitado: z.boolean().default(false)` dentro de `flags`, con el comentario de por qué lleva default. `lib/config/index.ts`: suma `mercadopago_habilitado: false` a `DEFAULT_FLAGS` y actualiza el doc comment del módulo.
  Tests: `schema.test.ts` (sin la clave → `false` sin afectar los otros flags; un valor no booleano falla) y `index.test.ts` (default fail-closed). Ajustar los fixtures que tipan `Config["flags"]`: `lib/config/index.test.ts`, `app/api/admin/config/route.test.ts`, `test/integration/auth-actions.test.ts` y los que aparezcan con `tsc`.
  Satisfies: US-5, US-1 (fail-closed)

- [x] **T2 — Corte de servidor en `crearCheckout`.**
  `app/(app)/comprar/_actions.ts`: `getFlags()` como primer paso; con el flag apagado devuelve `{ ok: false, error: "El pago con Mercado Pago no está disponible." }`.
  Tests en `_actions.test.ts`: mock de `getFlags` con el flag prendido por default en `beforeEach`; test nuevo con el flag apagado (sin `armarPreferencia`, `getPreferenceClient`, `create` ni `track`). Los tests que ya existen siguen pasando sin cambios ni `skip`.
  Satisfies: US-1
  Depends on: T1

- [x] **T3 — `/comprar` sin botón ni frase de MP con el flag apagado.**
  `app/(app)/comprar/page.tsx`: `getFlags()` en el `Promise.all`; con el flag apagado y sin el plan, copy "Acceso completo a la plataforma." sin `ComprarButton`. Los otros dos casos quedan igual. No se toca CSS.
  Verificación a mano en el preview con el flag prendido y apagado (sin harness nuevo).
  Satisfies: US-2
  Depends on: T1

- [x] **T4 — Toggle en el panel admin.**
  `app/admin/config/FlagsForm.tsx`: checkbox "Mercado Pago habilitado" con su aclaración (`styles.formAyuda`), más la nota "Hoy no controla nada en la app." bajo "Checkout habilitado".
  Test en `app/api/admin/config/route.test.ts`: un PATCH con `mercadopago_habilitado: true` se persiste. El endpoint no cambia.
  Satisfies: US-4
  Depends on: T1

- [x] **T5 — Comentario en el webhook.**
  `app/api/webhooks/mercadopago/route.ts`: comentario que explica por qué no lee el flag (pagos tardíos legítimos). Sin cambios de código; los tests del webhook siguen en verde.
  Satisfies: US-3

- [x] **T6 — Docs y env.**
  - `.env.example`: variables de MP marcadas como opcionales mientras el flag esté apagado.
  - `STACK.md`, fila "Pagos": MP desactivado por flag.
  - `docs/EDGE-CONFIG.md`: fila de `flags.mercadopago_habilitado`, nota en `checkout_habilitado`, el JSON de ejemplo y la sección "Reactivar Mercado Pago".
  Satisfies: US-6, US-3 (documentación)

- [x] **T7 — Verificación final y checklist.**
  - `tsc --noEmit`, `biome check .`, `vitest run` y `next build` sin las variables de MP.
  - Confirmar que no se borró nada de `lib/mercadopago/` ni de `app/api/webhooks/mercadopago/`.
  - `/design-critique` sobre `/comprar` y `/admin/config`, y `/simplify` sobre el diff.
  Satisfies: US-1 a US-6
  Estado (2026-10-02):
  - ✅ `tsc`, `biome check .` y `vitest run` (1176 tests) en verde.
  - ✅ `next build` OK sin las variables de MP.
  - ✅ Los 11 archivos de MP siguen en su lugar; solo cambió un comentario en el webhook.
  - ⚠️ `check-bundle-budget` falla en `/calculadora` (201 kB) y `/admin/contenido/[entidad]` (211 kB). No son rutas de este ticket; viene de `main`.
  - ⚠️ No se pudo ver `/comprar` en local: el Edge Config conectado todavía tiene `precios` con el formato viejo (`principiante`/`avanzado`), así que la página cae en "Checkout no disponible".
  - ✅ `/simplify`:
    - Un solo setup de test (`FLAGS_MP_ON`) y el JSX de `/comprar` sin ternarios anidados.
    - Comentarios más cortos.
    - Se sacó un `aria-describedby` que `Checkbox` ignoraba.
  - ✅ `/design-critique`, hecho desde el código porque en local no se pudo abrir ninguna de las dos pantallas: cada aclaración del panel quedó agrupada con su checkbox (`formCampo`). Pendientes para otros tickets:
    - Prop `hint` en `Checkbox`, que toca el design system.
    - `/comprar` sin acción con MP apagado (VGRP-64).
  - ⚠️ `e2e/pago-aprobado-acceso.spec.ts` espera el botón de MP en `/comprar`. Con el flag apagado hay que prenderlo en ese test (ya previsto en VGRP-66).
  Depends on: T1–T6
