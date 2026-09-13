# Design: VGRP-31 — Banner de la calculadora y directorio de agentes de compra

**Status:** Draft
**Last updated:** 2026-09-12
**Requirements:** [requirements-vgrp31.md](./requirements-vgrp31.md)

## Overview

Dos cambios chicos e independientes sobre infraestructura ya existente — sin
componentes nuevos de fondo:

1. **Banner de calculadora**: `InicioShell` (ya async) llama a `getLinks()` y pasa un
   `<TextLink>` como `children` del `<SeccionSlot variante="banner">` — mismo patrón ya
   usado para pasar `<AgentesGrid />`/`<VideoGrid />` como children.
2. **Video explicativo**: extender `videos.stage` a `1|2|3` (migración chica) y sumar
   `obtenerVideosStage3()` a `lib/data/videos.ts` (mismo core `obtenerVideosPorStage`,
   sin duplicar lógica) + `CANTIDAD_STAGE[3] = 1`. Se renderiza con el mismo
   `<VideoGrid>` ya existente (una grilla de 1 tile es válida, no hace falta un
   componente "video único" aparte).

## Migración — `videos.stage` acepta `3`

```sql
-- supabase/migrations/<timestamp>_videos_stage_explicativo.sql
alter table public.videos drop constraint videos_stage_check;
alter table public.videos add constraint videos_stage_check check (stage in (1, 2, 3));
comment on column public.videos.stage is
  '1 = Stage 1 (importaciones, 8 videos), 2 = Stage 2 (armado de tienda, 3 videos), '
  '3 = video explicativo del directorio de agentes (1 video) — VGRP-31.';
```

Nombre real del constraint a confirmar con `\d videos` antes de aplicar (Postgres lo
autogenera; puede no ser exactamente `videos_stage_check` si el CREATE TABLE original
lo nombró distinto).

## `lib/data/admin/contenido.ts` — Zod schema

```ts
const videoSchema = z.object({
  stage: z.union([z.literal(1), z.literal(2), z.literal(3)]), // antes: sólo 1|2
  // ...resto sin cambios
});
```

## `app/admin/contenido/[entidad]/ContenidoForm.tsx` — selector de stage

Sumar `<option value="3">3</option>` al `<select>` de stage. Nada más cambia en el
form genérico.

## `lib/data/videos.ts` — extensión

```ts
export const CANTIDAD_STAGE = { 1: 8, 2: 3, 3: 1 } as const;
export const TOTAL_VIDEOS = CANTIDAD_STAGE[1] + CANTIDAD_STAGE[2]; // sigue siendo 11 —
// el video explicativo NO cuenta para el contador de stats "X / 11" (MODULOS.md §2
// lo fija en 11 = 8+3, es formación; el explicativo es de infraestructura, otra
// sección). TOTAL_VIDEOS no suma CANTIDAD_STAGE[3] a propósito.

export async function obtenerVideosPorStage(admin: AdminClient, stage: 1 | 2 | 3) { /* sin cambios de lógica */ }

const obtenerVideosPorStageCached = unstable_cache(
  (stage: 1 | 2 | 3) => obtenerVideosPorStage(createServiceRoleClient(), stage),
  ["videos-por-stage"],
  { tags: [TAG_POR_ENTIDAD.videos] },
);

export const obtenerVideosStage3 = () => obtenerVideosPorStageCached(3);
```

**Nota sobre `TOTAL_VIDEOS`:** dejarlo en 11 (no 12) es deliberado — ver el comentario
de arriba. El video explicativo no es parte de la formación que el contador mide.

## `components/inicio/InicioShell.tsx` — cambios

```tsx
import { getLinks } from "@/lib/config";
import { TextLink } from "@/components/ui";
// ...
const [stage1, stage2, stage3, links] = await Promise.all([
  obtenerVideosStage1(),
  obtenerVideosStage2(),
  obtenerVideosStage3(),
  getLinks(),
]);
```

```tsx
<SeccionSlot
  eyebrow="Herramienta"
  titulo="Calculadora de costos"
  descripcion="Cuánto te sale realmente importar, en dos minutos."
  variante="banner"
>
  <TextLink
    href={links.calculadora}
    target="_blank"
    rel="noopener noreferrer"
    className={styles.ctaBanner}
  >
    Abrir calculadora
  </TextLink>
</SeccionSlot>
```

```tsx
<SeccionSlot
  eyebrow="Infraestructura"
  titulo="Agentes de compra en China"
  descripcion="6 agentes verificados con los que ya opera Jota."
>
  <VideoGrid videos={stage3} />
  <AgentesGrid />
</SeccionSlot>
```

`styles.ctaBanner` — clase nueva en `inicio.module.css`, mismo look que un botón
primario (reusa tokens, no reinventa `Button` porque `TextLink` ya es la primitiva
correcta para un link que navega, no que ejecuta una acción — mismo criterio que
`app/admin/contenido/page.tsx`).

## `getLinks()` desde un Server Component (no sólo Server Actions)

`lib/config/index.ts` no tiene `import "server-only"` hoy (lo usan Server Actions,
Route Handlers y ahora un Server Component async) — no hace falta agregarlo: no
resuelve ningún secreto (los links son públicos por definición, se navegan desde el
cliente), a diferencia de `lib/data/agentes.ts`/`lib/data/videos.ts`. Confirmado
releyendo `lib/config/index.ts` antes de asumir que hacía falta el import.

## Estructura de archivos

```
supabase/migrations/
  <timestamp>_videos_stage_explicativo.sql   # nuevo — alter check constraint

lib/data/admin/
  contenido.ts                                # MODIFICADO — videoSchema acepta stage 3

lib/data/
  videos.ts                                   # MODIFICADO — CANTIDAD_STAGE[3], obtenerVideosStage3()
  videos.test.ts                               # MODIFICADO — casos de stage 3

app/admin/contenido/[entidad]/
  ContenidoForm.tsx                            # MODIFICADO — option value="3"

components/inicio/
  InicioShell.tsx                              # MODIFICADO — CTA banner + video stage 3
  inicio.module.css                            # MODIFICADO — .ctaBanner
```

## Verificación planeada

- `videos.test.ts`: agregar casos para `stage=3` (mismo comportamiento que 1/2 —
  disponible/próximamente/relleno sintético con `CANTIDAD_STAGE[3]=1`).
- `pnpm build`: confirmar que `/dashboard/[variante]` sigue estática (leer `getLinks()`
  desde un Server Component async, igual que `obtenerVideosStage1/2/3()`, no debería
  forzar dynamic rendering — ninguno de los dos usa `cookies()`/headers de request).
- Browser real: crear 1 video de test con `stage=3`, `publicado=true`, confirmar que
  aparece en la sección de agentes; confirmar que el botón de la calculadora abre
  `vegroup.vercel.app/calculadora` (o lo que Edge Config tenga hoy) en pestaña nueva,
  sin navegar la pestaña del dashboard. Limpiar el video de test al terminar.

## Open questions / risks

1. **Nombre real del constraint de `stage`** — Postgres lo autogeneró en la migración
   original sin nombre explícito; hay que confirmarlo contra el schema real antes de
   escribir el `DROP CONSTRAINT` (o usar `ALTER COLUMN ... ADD CHECK` sin dropear si
   Postgres permite dos constraints coexistiendo — a resolver al aplicar la migración).
