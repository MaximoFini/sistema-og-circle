# Testing (VGRP-43)

## Decisión de entorno: mismo proyecto Supabase que la app

Mientras el proyecto no facture, **no hay branch de Supabase ni proyecto
separado para tests** — ambos tienen costo recurrente y no se justifican sin
ingresos (evaluado y descartado explícitamente en el ticket VGRP-43). Los
tests corren contra el **mismo proyecto** que usa la app (`og-circle`,
`docs/SUPABASE-SETUP.md`), que hoy no tiene usuarios pagos ni tráfico real.

Esto es un riesgo aceptado a propósito, no un descuido — y viene con dos
obligaciones no negociables:

1. **Todo dato que un test crea queda identificable.** El mecanismo es el
   dominio de email `@test.og-circle.invalid`
   (`TEST_EMAIL_SUFFIX`/`isTestEmail()` en `test/helpers/seed-users.ts`).
   Cualquier usuario de test — del seed o ad hoc — se crea con ese dominio.
   Nunca crear un usuario de test con otro email.
2. **Limpieza obligatoria.** `test/helpers/cleanup.ts` borra todo lo que
   tenga ese dominio (y sus filas de `pagos`) al final de cada corrida —
   automático, no opcional. Ver más abajo.

**Precaución operativa:** como esto pega contra el proyecto real, evitar
correr la suite completa mientras alguien está probando la app a mano, y
evitar correr tests en paralelo sin coordinar entre compañeros — pueden
pisarse datos entre sí. `playwright.config.ts` ya fuerza `workers: 1` por
esto mismo.

## Qué hay

- **Vitest** — unit + integración. `pnpm test`. Config en `vitest.config.ts`.
- **Playwright** — E2E, solo Chromium (STACK.md §9). `pnpm test:e2e`. Config
  en `playwright.config.ts`. Los tests viven en `e2e/`.
- **Seed idempotente** de 4 usuarios de test (uno por nivel + admin) en
  `supabase/seed/seed-test-users.ts`. `pnpm db:seed:test`.
- **Limpieza** en `test/helpers/cleanup.ts`:
  - `cleanupUser(userId)` — borra un usuario de test puntual (verifica el
    dominio antes de borrar, aborta si no es de test).
  - `cleanupAllTestArtifacts()` — barrido completo: borra `pagos` y
    `admin_audit_log` de todo usuario de test (incluidos los del seed —
    ambas tablas referencian `profiles` sin `ON DELETE CASCADE`, así que hay
    que vaciarlas antes de poder borrar el usuario) y borra los usuarios de
    test que NO son de los 4 fijos del seed. Corre automáticamente al final
    de `pnpm test` (`test/global-teardown.ts`) y `pnpm test:e2e`
    (`e2e/global-teardown.ts`), y a mano con `pnpm test:cleanup`
    (`scripts/cleanup-test-data.ts`).
- **Helpers** en `test/helpers/`: `db-client.ts` (clientes admin/anon),
  `auth.ts` (`createAuthenticatedUser`, `getTokenWithClaim`).
- **`NODE_ENV=test` obligatoria** para crear un cliente de test
  (`db-client.ts::assertTestRuntime`): sin esa marca explícita, no se crea
  ni el cliente admin ni el anon. Vitest la setea sola; `test:e2e`,
  `db:seed:test` y `test:cleanup` la fuerzan con `cross-env` en
  `package.json`. Si alguna vez ves el error "se llamaron fuera de un
  contexto de test", falta ese `cross-env` en el script que lo disparó.

No hay guarda de conexión contra un proyecto de producción separado: no
existe tal proyecto hoy (es el mismo `og-circle` para todo), así que no hay
nada contra qué comparar. Si en el futuro se crea uno, la protección real
pasa a ser no compartir sus credenciales con `NEXT_PUBLIC_SUPABASE_URL` /
`SUPABASE_SERVICE_ROLE_KEY` de test — evaluar en ese momento si conviene
reintroducir un chequeo explícito.

## Variables de entorno

Además de las que ya usa la app (`NEXT_PUBLIC_SUPABASE_URL`,
`NEXT_PUBLIC_SUPABASE_ANON_KEY`), los tests necesitan:

- `SUPABASE_SERVICE_ROLE_KEY` — service role del mismo proyecto (Project
  Settings → API → `service_role`). Bypassea RLS a propósito: el seed y la
  limpieza necesitan crear/borrar usuarios y escribir `nivel`/`rol` directo.
  **Nunca** debe llegar al bundle de cliente ni commitearse — solo en
  `.env.local` (gitignored) y como secret de GitHub Actions.

Ver `.env.example` para la plantilla completa. `vitest`/`playwright`/`tsx` NO
cargan `.env.local` solos (eso es algo que hace Next.js solo para sí mismo) —
`test/helpers/load-env.ts` lo hace por ellos, sin depender de la librería
`dotenv`. Alcanza con tener las variables en `.env.local`.

## Correr todo localmente

```bash
# unit + integración (no necesita Supabase salvo que el test lo use)
pnpm test

# una vez agregado SUPABASE_SERVICE_ROLE_KEY a .env.local:
pnpm db:seed:test
pnpm test:e2e

# si algo quedó sucio (una corrida que se cortó a la mitad, por ejemplo):
pnpm test:cleanup
```

`pnpm test:e2e` levanta `pnpm build && pnpm start` automáticamente (ver
`webServer` en `playwright.config.ts`) y corre contra ese server local.

## CI

`.github/workflows/ci.yml` usa `SUPABASE_SERVICE_ROLE_KEY`,
`NEXT_PUBLIC_SUPABASE_URL` y `NEXT_PUBLIC_SUPABASE_ANON_KEY` como secrets del
repo. Mientras `SUPABASE_SERVICE_ROLE_KEY` no exista como secret, los steps
de Playwright/seed/E2E/limpieza se saltan explícitamente (visible en el log,
no es un fallo silencioso). Apenas se configure el secret, corren en cada
push/PR contra el proyecto real — y por eso el step de limpieza corre con
`if: always()`, incluso si el E2E falla.

**Esto le da a CI acceso de service role al proyecto real** — es una
decisión consciente de este ticket, no un descuido: es la misma base contra
la que corre todo. Tenerlo en cuenta al revisar quién tiene acceso a los
secrets del repo.

## Qué falta a partir de acá (no es de este ticket)

- VGRP-44: tests de esquema/RLS/claims (deben poder fallar de verdad).
- VGRP-45: primer flujo E2E real — registro → login → dashboard con el nivel
  correcto.
- VGRP-42: segundo flujo E2E — pago aprobado → acceso activado — y
  regresión final de todo el sistema integrado.
