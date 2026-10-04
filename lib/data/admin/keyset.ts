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

/** Cursor opaco -> objeto validado con `schema`, o `null` si viene malformado
 *  o con valores fuera de forma (se ignora, arranca desde el principio). */
function decodeCon<T>(schema: z.ZodType<T>, cursor: string | undefined): T | null {
  if (!cursor) return null;
  try {
    const raw = Buffer.from(cursor, "base64url").toString("utf8");
    const parsed = schema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function decodeCursor(cursor: string | undefined): CursorKeyset | null {
  return decodeCon(cursorSchema, cursor);
}

export function encodeCursor(k: CursorKeyset | CursorEmail): string {
  return Buffer.from(JSON.stringify(k), "utf8").toString("base64url");
}

// Variante para listas ordenadas por `(email, id)` (orden alfabético de
// usuarios). `profiles.email` no es UNIQUE: el `id` desempata.
export interface CursorEmail {
  email: string;
  id: string;
}

const cursorEmailSchema = z.object({ email: z.string().min(1).max(320), id: z.uuid() });

export function decodeCursorEmail(cursor: string | undefined): CursorEmail | null {
  return decodeCon(cursorEmailSchema, cursor);
}

/** Filtro PostgREST `.or(...)` para "(columna, id) < (valor, id)" en orden
 *  desc (o ">" en asc). `valor` tiene que llegar ya seguro para el `.or()`:
 *  un timestamp validado, o pasado por `valorPostgrest`. */
function filtroTupla(
  columna: string,
  valor: string,
  id: string,
  direccion: "asc" | "desc",
): string {
  const op = direccion === "desc" ? "lt" : "gt";
  return `${columna}.${op}.${valor},and(${columna}.eq.${valor},id.${op}.${id})`;
}

/** Keyset sobre `(created_at, id)`. `keyset` ya viene validado por
 *  `decodeCursor` (createdAt = ISO datetime con offset, id = uuid): ninguno
 *  de los dos contiene caracteres que rompan el `.or()` sin comillas. La
 *  paginación keyset con timestamps con offset la ejercitan
 *  `audit-log.test.ts` y `usuarios.test.ts` (test "keyset: dos páginas
 *  disjuntas") contra la base real. */
export function keysetFilter(keyset: CursorKeyset, direccion: "asc" | "desc" = "desc"): string {
  return filtroTupla("created_at", keyset.createdAt, keyset.id, direccion);
}

/** Keyset sobre `(email, id)`, ascendente. El email va entre comillas: puede
 *  traer caracteres que el `.or()` interpretaría como sintaxis. */
export function keysetFilterEmail(c: CursorEmail): string {
  return filtroTupla("email", valorPostgrest(c.email), c.id, "asc");
}

/** Escapa los comodines de LIKE/ILIKE (`%`, `_`, `\`) para que el texto que
 *  tipea el admin se busque literal como substring, no como patrón. */
export function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

/** Encierra un valor arbitrario entre comillas dobles para usarlo dentro de un
 *  filtro `.or(...)` de PostgREST: así las comas, paréntesis y puntos del texto
 *  no se interpretan como sintaxis del filtro. Escapa `\` y `"`. */
export function valorPostgrest(s: string): string {
  return `"${s.replace(/[\\"]/g, "\\$&")}"`;
}
