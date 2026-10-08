// Cupos de las grillas de videos de Inicio. Módulo SIN imports a propósito:
// `lib/data/videos.ts` importa de `lib/data/admin/contenido.ts` (el tag de
// revalidación), y `contenido.ts` necesita estos números para hacer cumplir el
// cupo al publicar. Si vivieran en `videos.ts` habría un ciclo.

/** Tamaño fijo de cada grilla (PRD / MODULOS.md §2) — no depende de cuántas filas haya
 *  cargadas todavía en la tabla, ver requirements-vgrp29.md "Decisiones asumidas".
 *  stage 3 (VGRP-31) = video explicativo del directorio de agentes, 1 solo video. */
export const CANTIDAD_STAGE = { 1: 8, 2: 3, 3: 1 } as const;

// El explicativo (stage 3) NO cuenta acá: MODULOS.md §2 fija el contador de stats en
// "X / 11" (8+3, formación) — el video de agentes es infraestructura, otra sección.
export const TOTAL_VIDEOS = CANTIDAD_STAGE[1] + CANTIDAD_STAGE[2];
