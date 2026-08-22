# Sistema OG Circle

> Fuente: descripción del proyecto "Sistema OG Circle (Jero-Rami)" en Plane (VGRP). Última sincronización: 2026-08-21.

Plataforma cerrada (paga) para personas en Argentina de 20 a 40 años que quieren empezar a importar mercadería de China y venderla online, resolviendo el problema real de quienes se paralizan en el primer envío: no saben cuánto les cuesta realmente el producto puesto en Argentina, no confían en un agente de compras, no tienen forma de pagar a China sin SWIFT, y no tienen dónde vender lo que importan.

No es un curso: combina formación en video (8 videos de importación + 3 de ecommerce) con acceso directo a la infraestructura operativa que ya usa Jota Vera, quien opera la red: una calculadora de costos de importación ya construida y en producción (`vegroup.vercel.app/calculadora`), un directorio de 6 agentes de compra verificados en China, depósitos en Miami/China/España, gestión de flete y despacho, tracking de envíos vía Traxcargo, pagos SWIFT a China, y una red de profesionales (contable, automatizaciones, agencia de marketing, UGC creator).

El acceso se vende en 2 niveles con pago único y acceso de por vida (Principiante $75.000 ARS / Avanzado $125.000 ARS), sin suscripción.

## Estado del código

**22/08/2026** — Ya existe el bootstrap del proyecto Next.js donde se va a construir la Fase 2 ("MVP para cobrar"): Next.js 15 (App Router, React 19, TypeScript strict), sin Tailwind, CSS Modules + tokens propios (`app/tokens.css`, portados de [DESIGN.md](DESIGN.md)), Biome para lint/format, pnpm, `vercel.json` con región `gru1`, CI en GitHub Actions (typecheck + Biome + build) y carpeta `supabase/` lista para la migración inicial.

El CLI de Supabase no estaba instalado al momento de este bootstrap: `supabase/migrations/` se creó a mano (con `.gitkeep`) en vez de con `supabase init`. Falta correr `supabase init` de verdad — o al menos generar `supabase/config.toml` — cuando alguien tenga el CLI disponible.

Sin auth, sin middleware, sin contenido real todavía: eso corresponde a tickets posteriores del Epic VGRP-14.

## Estado actual (agosto 2026)

El desarrollo de la plataforma todavía **no comenzó**. Lo único construido y en producción es la calculadora de costos. El proyecto está en **Fase 1 - Validación**: se va a construir únicamente una landing page (con spec de copy y diseño ya definido en detalle en [LANDING.md](LANDING.md)) que presenta la plataforma completa y deriva cualquier clic de compra a una lista de espera con 10% de descuento, para confirmar demanda real antes de invertir en el desarrollo del producto completo.

Ver [CONTEXT.md](CONTEXT.md) para el contexto de negocio completo y el roadmap de 4 fases, y [MODULOS.md](MODULOS.md) para el detalle pantalla por pantalla del producto post-Fase 1.

## Stack técnico (definido, aún no implementado)

Definición completa, con versiones, alternativas descartadas y orden de ejecución, en [STACK.md](STACK.md). Resumen:

- **Next.js 15** (App Router, React 19, TypeScript strict) en **Vercel**, funciones en la región `gru1` (São Paulo)
- **Supabase** en `sa-east-1` (Postgres + Auth + RLS + Storage), con el nivel de acceso viajando como claim en el JWT
- **Vercel Edge Config** para precios, flags y links externos (editable sin deploy)
- SDK oficial de **Mercado Pago** para checkout automático vía webhook
- **YouTube** no listado para video, detrás de una interfaz `VideoProvider` (migrable a Mux en Fase 4)
- **Resend + React Email** para emails transaccionales
- Apoyo: Zod, Upstash Redis, Sentry + Speed Insights, Biome, pnpm, Vitest + Playwright

## Documentación del repo

| Archivo | Contenido |
|---|---|
| [CONTEXT.md](CONTEXT.md) | Contexto de negocio, vocabulario del dominio, decisiones estructurales y roadmap de 4 fases |
| [MODULOS.md](MODULOS.md) | Pantalla por pantalla de la plataforma completa (post-Fase 1) |
| [LANDING.md](LANDING.md) | Estructura real de la landing (Fase 1): secciones, componentes, flujo del Demo |
| [DESIGN.md](DESIGN.md) | Sistema visual real de la landing: paleta, tipografía, componentes, movimiento y accesibilidad |
| [ARCHITECTURE.md](ARCHITECTURE.md) | ADR-001: arquitectura propuesta para la plataforma (Fase 2+), con opciones evaluadas y trade-offs |
| [STACK.md](STACK.md) | Stack técnico definitivo: piezas concretas, versiones, qué se descarta y por qué, orden de ejecución |

Toda la documentación está sincronizada manualmente desde las páginas del proyecto **Sistema OG Circle** en Plane (workspace VGRP).
