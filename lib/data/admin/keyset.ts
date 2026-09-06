// =============================================================================
// VGRP-36 / Bloque 5 — Cursor keyset compartido para las listas del panel.
//
// Las tres pantallas de lectura del panel (auditoría, usuarios, pagos) paginan
// por KEYSET sobre `(created_at desc, id desc)` — nunca offset (design.md
// §Paginación). El cursor es opaco: base64url de `{ createdAt, id }`, validado
// ESTRICTAMENTE antes de interpolarse en el filtro `.or()` de PostgREST
// (createdAt como ISO datetime con offset, id como uuid). Un cursor fabricado
// con otra cosa (intento de inyectar operadores PostgREST en el OR) no pasa el
// schema -> se ignora y la lista arranca desde el principio.
// =============================================================================

import { z } from "zod";

export interface CursorKeyset {
  createdAt: string;
  id: string;
}

const cursorSchema = z.object({
  createdAt: z.iso.datetime({ offset: true }),
  id: z.uuid(),
});

/** Cursor opaco -> `{ createdAt, id }`, o `null` si viene malformado o con
 *  valores fuera de forma (se ignora, arranca desde el principio). */
export function decodeCursor(cursor: string | undefined): CursorKeyset | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = cursorSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function encodeCursor(k: CursorKeyset): string {
  return Buffer.from(JSON.stringify(k), "utf8").toString("base64url");
}

/** Filtro PostgREST `.or(...)` para "(created_at, id) < (cursor)" en orden
 *  desc. `keyset` ya viene validado por `decodeCursor` (createdAt = ISO
 *  datetime con offset, id = uuid): ninguno de los dos contiene caracteres
 *  que rompan el `.or()` sin comillas. La paginación keyset con timestamps
 *  con offset la ejercitan `audit-log.test.ts` y `usuarios.test.ts` (test
 *  "keyset: dos páginas disjuntas") contra la base real. */
export function keysetFilter(keyset: CursorKeyset): string {
  return `created_at.lt.${keyset.createdAt},and(created_at.eq.${keyset.createdAt},id.lt.${keyset.id})`;
}

/** Escapa los comodines de LIKE/ILIKE (`%`, `_`, `\`) para que el texto que
 *  tipea el admin se busque literal como substring, no como patrón. */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}
