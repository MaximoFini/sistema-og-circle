// VGRP-47 §4 — frontera cliente/servidor: confirma que los módulos con
// privilegios de servidor (guards de admin, capa de datos de admin, cliente
// de service role) tienen `import "server-only"` cerca del principio del
// archivo. Sin esto, un import accidental desde un Server Component o un
// archivo de cliente podría colar código con privilegios totales sobre la
// base al bundle de cliente sin que el build de Next lo detecte.
//
// Test estructural: lee archivos con `node:fs`, no ejecuta nada.

import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");

const ARCHIVOS = [
  "lib/auth/admin.ts",
  "lib/data/admin/audit-log.ts",
  "lib/data/admin/usuarios.ts",
  "lib/data/admin/pagos.ts",
  "lib/supabase/service-role.ts",
];

/** Primeras líneas de código real: se descartan comentarios de línea (`//`),
 *  líneas vacías, y bloques `/* ... *\/` (con o sin contenido en la misma
 *  línea de apertura/cierre) — son justo lo que encabeza estos archivos
 *  (bloques de comentario largos explicando el porqué del módulo). */
function primerasLineasDeCodigo(content: string, n: number): string[] {
  const lineas = content.split(/\r?\n/);
  const out: string[] = [];
  let dentroDeBloque = false;

  for (const linea of lineas) {
    if (out.length >= n) break;
    const trimmed = linea.trim();

    if (dentroDeBloque) {
      if (trimmed.includes("*/")) dentroDeBloque = false;
      continue;
    }
    if (trimmed === "") continue;
    if (trimmed.startsWith("//")) continue;
    if (trimmed.startsWith("/*")) {
      if (!trimmed.includes("*/")) dentroDeBloque = true;
      continue;
    }

    out.push(trimmed);
  }

  return out;
}

describe("frontera server-only", () => {
  it.each(ARCHIVOS)(
    '%s tiene `import "server-only";` entre sus primeras líneas de código',
    (rutaRelativa) => {
      const fullPath = path.join(ROOT, rutaRelativa);
      expect(
        existsSync(fullPath),
        `No se encontró ${rutaRelativa} — si se renombró, buscá el path real bajo lib/ y actualizá ` +
          "este test.",
      ).toBe(true);

      const content = readFileSync(fullPath, "utf8");
      const primeras = primerasLineasDeCodigo(content, 5);

      expect(
        primeras.includes('import "server-only";'),
        `${rutaRelativa} no tiene \`import "server-only";\` entre sus primeras 5 líneas de código ` +
          "(sin contar comentarios). Este archivo tiene privilegios de servidor (bypassa RLS, o es " +
          "parte de la cadena de guards de admin) y JAMÁS debe poder llegar al bundle de cliente — " +
          'agregá `import "server-only";` como uno de los primeros imports del archivo.',
      ).toBe(true);
    },
  );
});
