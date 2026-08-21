# STACK.md — Stack técnico definitivo

> Complementa [ARCHITECTURE.md](ARCHITECTURE.md) (ADR-001). La ADR decide *la forma* del sistema ("shell estático + claim + overlay"); este documento decide *las piezas concretas*. Reemplaza la lista tentativa de "Stack técnico propuesto" del [README.md](README.md).
>
> **Criterio de selección:** las dos prioridades declaradas son **velocidad percibida** y **escala**. A la escala real de este producto (cientos a pocos miles de usuarios, un solo país, un solo programador), esas dos prioridades **no se ganan eligiendo tecnología más potente** — se ganan eligiendo menos piezas, más cerca del usuario, y sacando el camino caliente de la base de datos. Todo lo de abajo está elegido con ese sesgo.

---

## 1. Resumen ejecutivo

| Capa | Elección | Versión | Por qué esta y no otra |
|---|---|---|---|
| Framework | **Next.js App Router** | 15.x (React 19) | Ya está en producción en la landing. Es lo único que da prerender + streaming + Server Components en un solo modelo mental. |
| Lenguaje | **TypeScript** `strict` | 5.x | El contenido vive en código (ADR §2c): el compilador es el reemplazo del panel de admin. Sin `strict` esa garantía no existe. |
| Runtime | **Node 22** (no Edge Runtime) | — | El SDK de Anthropic y la base NCM de 4,3 MB no entran cómodos en Edge. Un solo runtime = una sola clase de bugs. |
| Hosting | **Vercel**, región `gru1` | — | La decisión de mayor impacto de todo el documento (§2). |
| Base + Auth | **Supabase**, región `sa-east-1` | — | Postgres real + Auth + RLS + Storage, en la misma ciudad que las funciones. |
| Acceso a datos | **`@supabase/supabase-js` + `@supabase/ssr`** | 2.x / 0.6.x | Sin ORM (§5). El modelo son 3 tablas y 1 query por sesión. |
| Migraciones | **Supabase CLI** (SQL versionado en `supabase/migrations/`) | — | Migraciones en el repo, no clics en un dashboard. |
| Config mutable | **Vercel Edge Config** | — | Precios, % early adopter, flags de fase, links externos. Editable en segundos, sin deploy, lectura sin latencia de red. |
| Estilos | **CSS con tokens + CSS Modules** (nada de Tailwind) | — | §6. |
| Pagos | **`mercadopago`** (SDK oficial) | 2.x | Único método 100 % automatizable. Webhook con firma HMAC + `proveedor_ref UNIQUE`. |
| Validación | **Zod** | 4.x | Frontera de confianza: webhook de MP, Server Actions, respuestas de IA. |
| Emails | **Resend + React Email** | — | DX muy por encima de SendGrid; plantillas como componentes, mismo lenguaje que el resto. |
| Rate limit / cache efímero | **Upstash Redis + `@upstash/ratelimit`** | — | §7 — ojo con `@vercel/kv`. |
| Video | **YouTube no listado** detrás de una interfaz `VideoProvider` | — | Fase 4 se migra a Mux tocando una sola pieza. |
| Observabilidad | **Vercel Speed Insights + Analytics** y **Sentry** | — | §8. Sin medición, "que funcione rápido" es una opinión. |
| Lint + format | **Biome** | 2.x | Un binario, milisegundos, cero peleas ESLint/Prettier. Clave con 3 devs junior. |
| Package manager | **pnpm** | 10.x | Instalaciones rápidas y deterministas, sin phantom deps. |
| Tests | **Vitest** (unit) + **Playwright** (2 flujos críticos) | — | §9. Nada más. |

---

## 2. La única decisión que realmente define "rápido": la región

Va primero porque **ninguna otra elección de este documento la compensa**.

- Funciones de Vercel en **`gru1` (São Paulo)** — `vercel.json` → `{ "regions": ["gru1"] }`.
- Proyecto Supabase en **`sa-east-1` (São Paulo)**.

Con los defaults (funciones en `iad1`, Virginia) cada query cruza el continente dos veces: ~200 ms por query. Tres queries en cascada = ~600 ms de pantalla en blanco antes del primer pixel útil. En la misma región eso baja a ~10 ms. No cuesta una línea de código.

> **Irreversible sin migrar:** la región de un proyecto Supabase no se cambia después. Crear el proyecto en `sa-east-1` es un action item de **hoy**, no de Fase 2.

Los assets estáticos (shell del dashboard, landing) igual salen del PoP más cercano al usuario — Buenos Aires — porque son estáticos. La región solo afecta a lo dinámico, que en esta arquitectura es la minoría.

---

## 3. Framework y renderizado

**Next.js 15 App Router, React 19, un repo, un deploy.** El route group `(app)` convive con `(marketing)` (ADR §4).

Las reglas de rendering son lo que convierte la elección en velocidad real:

| Pieza | Estrategia |
|---|---|
| Landing, legales, grillas de contenido | Estático (prerender en build) → sale del CDN |
| Shell del dashboard | Estático, en sus dos variantes de nivel |
| Stats del usuario, progreso, envíos | Dinámico dentro de `<Suspense>`, una sola query |
| Webhook MP, demo IA, escrituras | Route Handlers, runtime Node, `dynamic = 'force-dynamic'` |

**No** apoyar el lanzamiento en Partial Prerendering mientras siga siendo flag experimental: segmento estático + `<Suspense>` da el mismo resultado percibido y es estable.

**Regla dura de bundle:** todo archivo que contenga un `secret` (contacto del agente, datos SWIFT, ID de video) arranca con `import 'server-only'`. No es una convención de estilo: es lo que impide que un `'use client'` mal puesto publique el producto entero.

---

## 4. Identidad: el claim viaja en el JWT

- **Supabase Auth** con **claves asimétricas (ES256)** y verificación **local** del token.
- Un **Auth Hook** escribe `app_metadata.nivel` cuando se activa el pago.
- Middleware y Server Components leen el claim de la cookie. **Cero roundtrips a la base para decidir qué mostrar.**

Llamar a `supabase.auth.getUser()` en cada request es el error de performance más común de este stack: agrega un viaje al servidor de Auth en cada navegación. Con claves asimétricas, verificar es CPU en memoria.

**RLS activa en todas las tablas**, con policies que leen `auth.jwt() -> 'app_metadata' -> 'nivel'` — nunca una subquery a `profiles` (esa se evalúa por fila). RLS acá es red de seguridad, no el mecanismo primario de lectura.

---

## 5. Datos: sin ORM, a propósito

`@supabase/supabase-js` + tipos generados con `supabase gen types typescript`, todo detrás de una carpeta `lib/data/` disciplinada.

**Por qué no Prisma:** cliente pesado, peores cold starts en serverless, y una capa de migraciones que compite con la de Supabase.
**Por qué no Drizzle todavía:** es la alternativa correcta *si* el SQL crece. Con 3 tablas y una query caliente, agrega una capa sin comprar nada. Revisar en Fase 3, cuando aparezcan el panel de admin y los reportes.

**Pooling — el modo clásico de morir.** Toda conexión desde una función serverless va por el pooler de Supabase en **modo transaction (puerto 6543)**, nunca por la conexión directa (5432). Es una línea en la connection string y la diferencia entre aguantar un pico de lanzamiento y caerse en él. La conexión directa queda solo para migraciones.

Modelo mínimo: `profiles` (1 fila por usuario, `progreso` como `jsonb`), `pagos` (ledger inmutable con `proveedor_ref UNIQUE`), `leads`. Detalle en ADR §5.

---

## 6. Estilos: seguir con CSS + tokens, no migrar a Tailwind

La landing ya tiene un sistema visual real y documentado ([DESIGN.md](DESIGN.md)): tokens en `:root`, tres superficies, un solo acento ámbar.

**Recomendación: no introducir Tailwind.** Migrar significa reescribir la landing en producción a mitad de proyecto, o convivir con dos sistemas de estilo — que es peor que cualquiera de los dos solo. Para el route group `(app)`, **CSS Modules consumiendo los mismos tokens**: scoping automático, cero runtime, cero dependencia nueva.

Si en algún momento el equipo quiere Tailwind, la vía sana es Tailwind v4 con `@theme` mapeado a los tokens existentes, y **para todo el repo de una vez** — nunca solo para `(app)`.

**Deuda que conviene saldar antes de Fase 2:** las ~530 líneas de CSS muerto `.bp-*` en `globals.css` (DESIGN.md §6). Es peso que todos los usuarios descargan para nada.

---

## 7. Piezas de apoyo

**Rate limiting / cache efímero.** La landing hoy usa `@vercel/kv`. Ese producto quedó absorbido por la integración de **Upstash Redis** en el Marketplace de Vercel y `@vercel/kv` está en camino de baja. Conviene migrar a `@upstash/redis` + `@upstash/ratelimit` (misma API mental, cliente mantenido). **Verificar el estado exacto en el dashboard de Vercel antes de tocar nada** — no rehacer algo que hoy funciona sin confirmarlo.

**Configuración mutable.** Vercel Edge Config para precios, % de early adopter, flags de fase y links externos (calculadora, `wa.me`, Traxcargo). Esto es lo que cumple literalmente la decisión ya registrada de "precios en configuración, no hardcodeados" sin construir un panel de admin.

**Storage.** Supabase Storage para comprobantes de transferencia/USDT (Fase 3): bucket **privado**, acceso solo por signed URL de vida corta. Un comprobante bancario es un documento con datos personales.

**Emails.** Resend + React Email (bienvenida, confirmación de pago, reset). Configurar SPF/DKIM en el dominio propio desde el día uno: un email transaccional que cae en spam se lee como "me cobraron y no me llegó nada".

**Video.** YouTube no listado detrás de una interfaz `VideoProvider` definida desde el primer día. En Fase 4, migrar a Mux es implementar esa interfaz de nuevo, no refactorizar.

---

## 8. Medición (sin esto, "rápido" es una opinión)

- **Vercel Speed Insights** — Core Web Vitals de campo, con usuarios argentinos reales. Es el único número que importa.
- **Vercel Analytics** — conversión por nivel, que es exactamente lo que exige la regla de avance de Fase 1 → Fase 2.
- **Sentry** — errores de servidor y de cliente.

Alerta mínima obligatoria: **fallo del webhook de MP**. Es el peor bug posible del sistema — alguien pagó y no tiene acceso.

---

## 9. Calidad y tooling

- **pnpm** + **Biome** (lint + format en un binario) + **TypeScript strict**.
- **CI en GitHub Actions:** `typecheck` + `biome ci` + `build`. Nada más — el build de Next atrapa la mayoría de los errores reales.
- **Vitest** solo donde hay lógica de verdad: cálculo de entitlement por nivel, validación del webhook, proyección `pagos` → `nivel`.
- **Playwright** para exactamente dos flujos: *registro → login → dashboard con el nivel correcto* y *pago aprobado → acceso activado*. Si esos dos andan, el producto anda.
- Los hooks de `.claude/settings.json` (code-review pre-commit, security-review pre-push) ya cubren la revisión — ver [CLAUDE.md](CLAUDE.md).

---

## 10. Lo que explícitamente NO va

Cada pieza de acá abajo es una que un equipo agrega "por las dudas" y después mantiene para siempre. A esta escala, ninguna se paga.

| Descartado | Por qué |
|---|---|
| Backend propio (NestJS/Fastify) | Duplica auth, migraciones, deploys y observabilidad para un sistema de pocas req/s. Es la forma más rápida de no llegar a la fecha. |
| Cloudflare Workers / D1 | Obliga a reescribir la landing (Three.js, SDK de Anthropic, NCM 4,3 MB). El edge optimiza para audiencia global; acá es un solo país. |
| Docker / Kubernetes | No hay nada que containerizar. Vercel + Supabase son el runtime. |
| tRPC / GraphQL | Server Actions y Route Handlers ya son typesafe end-to-end en este stack. |
| Redux / Zustand / Jotai | El estado del dashboard es del servidor. Estado de cliente hay casi cero. |
| React Query | Recién tiene sentido en Comunidad (Fase 4), con feed paginado. No antes. |
| Turborepo / monorepo | Un repo, un deploy (ADR §4). Un monorepo con un solo package es ceremonia. |
| ORM pesado | §5. |
| Tailwind (hoy) | §6. |
| Cola de mensajes para el webhook | A este volumen, verificar firma + insert + responder 200 tarda milisegundos. `proveedor_ref UNIQUE` cubre los reintentos. |

---

## 11. Qué se rompe primero (honestidad sobre la escala)

Con 10.000 usuarios pagos y 20 % activos por día: ~2.000 sesiones diarias, <0,1 req/s promedio, picos de pocos req/s. **Este stack no tiene un problema de escala por años.** Lo que sí puede fallar, en orden real de probabilidad:

| # | Qué se rompe | Señal para actuar | Qué se hace |
|---|---|---|---|
| 1 | **Costo de la IA de la demo** (tráfico anónimo, sin login) | Gasto diario de Anthropic subiendo sin correlación con leads | Mantener el cupo global diario. Rate limit por IP + presupuesto duro. |
| 2 | **Conexiones a Postgres** en un pico de lanzamiento | Errores `too many connections` | Ya mitigado: pooler en modo transaction (§5). Verificarlo *antes* del lanzamiento, no durante. |
| 3 | **Webhook de MP fallando en silencio** | Usuarios que pagaron y escriben por WhatsApp sin acceso | Sentry + alerta; el ledger `pagos` permite reprocesar. |
| 4 | **Comunidad (Fase 4)** pasa a ser el uso principal | El feed se vuelve la pantalla más visitada | Deja de ser app estática: Realtime + paginación keyset, en ruta aislada para no contaminar el dashboard. |
| 5 | Contenido que cambia más de 1 vez por semana | Molestia real del equipo con el deploy por cambio de texto | Recién ahí: contenido a base + `revalidateTag`. |

El cuello de botella de este proyecto no es técnico. Es la **confirmación manual de pagos por transferencia/USDT sin panel de admin** — el punto de fricción operativa más grande del sistema, y la razón por la que el brief técnico recomienda lanzar solo con Mercado Pago.

---

## 12. Orden de ejecución

**Hoy (Fase 1, sobre la landing en producción)**
1. [ ] `vercel.json` → `{ "regions": ["gru1"] }`. Medir antes/después en `/api/demo/*`.
2. [ ] Crear el proyecto Supabase en **`sa-east-1`**. *Irreversible — decidirlo ahora.*
3. [ ] Precios, % early adopter y links externos → Vercel Edge Config.
4. [ ] Speed Insights + Analytics + Sentry. Instrumentar conversión por nivel.
5. [ ] Evaluar migración `@vercel/kv` → `@upstash/redis` (verificando estado en el dashboard primero).
6. [ ] Borrar el CSS muerto `.bp-*` de `globals.css`.

**Fase 2 (MVP para cobrar)**
7. [ ] pnpm + Biome + `tsconfig` en `strict`.
8. [ ] Route group `(app)` con layout y middleware de sesión propios.
9. [ ] Supabase Auth con claves asimétricas + Auth Hook que inyecta `app_metadata.nivel`.
10. [ ] `content/*.ts` tipado, split `publicMeta` / `secret`, `import 'server-only'` en los secretos.
11. [ ] `profiles` y `pagos` con RLS leyendo `auth.jwt()`. Connection string por el pooler (6543).
12. [ ] Webhook de MP: firma HMAC + `proveedor_ref UNIQUE` + trigger que proyecta el nivel.
13. [ ] Dashboard: shell prerenderizado + `<Suspense>` para stats. `VideoProvider` desde el día uno.
14. [ ] Resend + React Email + SPF/DKIM. Legales.
15. [ ] Los 2 tests de Playwright de §9.
