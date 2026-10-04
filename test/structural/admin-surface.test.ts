// VGRP-47 §2 — test ESTRUCTURAL de la superficie de rutas de admin.
//
// No es un test de comportamiento en runtime: lee archivos del repo con
// `node:fs` y falla si la estructura no cumple una regla. Alcanza con
// `fs.readdirSync` recursivo + regex acotadas sobre el contenido — no hace
// falta un parser de AST. El valor de este archivo es que una convención que
// hoy se sostiene "a mano" (todo admin pasa por un guard) queda ANCLADA: si
// alguien agrega un handler o una página nueva sin el guard correspondiente,
// o en el orden equivocado, este test se pone rojo con un mensaje que dice
// qué hacer.

import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const APP_ADMIN = path.join(ROOT, "app/admin");
const API_ADMIN = path.join(ROOT, "app/api/admin");

/** Recorre `dir` recursivamente y devuelve los paths absolutos de todos los
 *  archivos cuyo nombre matchea `fileName` exactamente. */
function findFiles(dir: string, fileName: string): string[] {
  if (!existsSync(dir)) return [];
  const out: string[] = [];
  for (const entry of readdirSync(dir)) {
    const full = path.join(dir, entry);
    const st = statSync(full);
    if (st.isDirectory()) {
      out.push(...findFiles(full, fileName));
    } else if (entry === fileName) {
      out.push(full);
    }
  }
  return out;
}

function rel(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

/**
 * Saca comentarios `//` y `/* *​/` antes de buscar una llamada real en el
 * código. Sin esto, un comentario que simplemente MENCIONA el nombre de la
 * función (p. ej. la documentación de cabecera "`requireAdmin()` va PRIMERO")
 * hace pasar el test aunque el código ya no llame a nada — encontrado durante
 * la verificación de VGRP-47 (el ritual de "romper a propósito y confirmar
 * rojo"): sacar la llamada real dejando el comentario de docs intacto pasaba
 * en verde. Suficiente para este uso (buscar `nombre(` en el cuerpo real);
 * no hace falta un parser de AST.
 */
function sinComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

describe("app/admin/ — todo cuelga de un único layout gateado", () => {
  it("app/admin/layout.tsx llama a requireAdminPage()", () => {
    const layoutPath = path.join(APP_ADMIN, "layout.tsx");
    expect(
      existsSync(layoutPath),
      `Falta ${rel(layoutPath)} — es el layout que gatea todo /admin.`,
    ).toBe(true);

    const content = readFileSync(layoutPath, "utf8");
    const codigo = sinComentarios(content);
    const importaGuard = /from\s+["']@\/lib\/auth\/admin["']/.test(codigo);
    const llamaGuard = codigo.includes("requireAdminPage(");

    expect(
      importaGuard && llamaGuard,
      `${rel(layoutPath)} tiene que importar y llamar a requireAdminPage() de "@/lib/auth/admin" — ` +
        "es la 2da capa de gating del panel (middleware -> layout -> requireAdmin() en cada handler). " +
        "Si se movió a otro archivo, actualizá este test para apuntar ahí.",
    ).toBe(true);
  });

  it("no existe un app/admin/**/layout.tsx alternativo que no pase por el layout raíz", () => {
    const layouts = findFiles(APP_ADMIN, "layout.tsx");
    const layoutsAnidados = layouts.filter((p) => p !== path.join(APP_ADMIN, "layout.tsx"));

    expect(
      layoutsAnidados,
      "Se encontró un layout.tsx anidado bajo app/admin/ además del layout raíz: " +
        `${layoutsAnidados.map(rel).join(", ")}. ` +
        "Un layout anidado puede renderizar contenido ANTES de que corra requireAdminPage() del " +
        "layout raíz si no lo llama también — borralo, o si es intencional, hacé que también " +
        "llame a requireAdminPage() y agregalo a la excepción de este test.",
    ).toEqual([]);
  });

  it("ningún page.tsx bajo app/admin/ (salvo not-found.tsx) queda fuera del árbol del layout gateado", () => {
    // app/admin/not-found.tsx es el 404 tematizado que renderiza notFound() —
    // por diseño no pasa por requireAdminPage() (lo dispara request de un
    // no-admin, un id inexistente, etc.), así que se excluye explícitamente.
    const pages = findFiles(APP_ADMIN, "page.tsx");

    expect(
      pages.length,
      "No se encontró ningún page.tsx bajo app/admin/ — revisá el path.",
    ).toBeGreaterThan(0);

    // Como `app/admin/layout.tsx` envuelve a TODOS sus hijos (Next.js: todo
    // page.tsx bajo un directorio hereda el layout.tsx de ese directorio y de
    // sus ancestros), y la prueba anterior garantiza que no hay otro layout
    // que se salte ese guard, alcanza con confirmar que cada page.tsx vive
    // efectivamente bajo app/admin/ (y no, p. ej., en un route group hermano
    // que no cuelga del layout).
    for (const p of pages) {
      expect(
        p.startsWith(APP_ADMIN + path.sep),
        `${rel(p)} no cuelga de app/admin/ — no hereda requireAdminPage() del layout. Movelo bajo ` +
          "app/admin/ o agregale su propio guard.",
      ).toBe(true);
    }
  });
});

describe("app/api/admin/**/route.ts — requireAdmin() antes de createServiceRoleClient()", () => {
  const routes = findFiles(API_ADMIN, "route.ts");

  it("existe al menos un route.ts bajo app/api/admin/ (ancla — si esto falla, revisá el glob)", () => {
    expect(routes.length).toBeGreaterThan(0);
  });

  it("todos los route.ts reales bajo app/api/admin/ empiezan con ese prefijo", () => {
    // Trivial hoy (findFiles ya busca ahí adentro) — el valor real es el
    // mensaje: si algún día este test se generaliza a recorrer app/api/**
    // entero y aparece una ruta de "admin" fuera de app/api/admin/, hay que
    // confirmar que middleware.ts la cubre con ADMIN_PREFIXES.
    for (const r of routes) {
      expect(
        rel(r).startsWith("app/api/admin/"),
        `${rel(r)} no está bajo app/api/admin/ — agregaste una ruta de admin en otro lado, ` +
          "confirmá que middleware.ts la cubre con ADMIN_PREFIXES (o movela bajo app/api/admin/).",
      ).toBe(true);
    }
  });

  it.each(routes.map((r) => [rel(r), r] as const))(
    "%s llama a requireAdmin() antes de createServiceRoleClient()",
    (_label, routePath) => {
      const content = readFileSync(routePath, "utf8");
      const codigo = sinComentarios(content);

      const importaRequireAdmin = /from\s+["']@\/lib\/auth\/admin["']/.test(codigo);
      expect(
        importaRequireAdmin,
        `${rel(routePath)} no importa requireAdmin de "@/lib/auth/admin". Todo handler bajo ` +
          "app/api/admin/ tiene que empezar con `const guard = await requireAdmin(); " +
          "if (!guard.ok) return guard.response;` antes de tocar la capa de datos.",
      ).toBe(true);

      const idxRequireAdmin = codigo.indexOf("requireAdmin(");
      expect(
        idxRequireAdmin,
        `${rel(routePath)} importa requireAdmin pero no lo LLAMA (no aparece "requireAdmin(" en ` +
          "el cuerpo real, sin contar comentarios). Agregá `const guard = await requireAdmin(); " +
          "if (!guard.ok) return guard.response;` al principio del handler.",
      ).toBeGreaterThan(-1);

      const idxServiceRole = codigo.indexOf("createServiceRoleClient(");
      if (idxServiceRole === -1) {
        // Un handler que no usa el cliente de service role no tiene nada más
        // que chequear acá (igual ya se confirmó arriba que llama al guard).
        return;
      }

      expect(
        idxRequireAdmin < idxServiceRole,
        `En ${rel(routePath)}, createServiceRoleClient() aparece ANTES que requireAdmin() en el ` +
          "archivo — mové el guard (`if (!guard.ok) return guard.response;`) antes de instanciar " +
          "el cliente de service role. Un guard que corre después ya dejó pasar código con " +
          "privilegios totales sobre la base sin haber validado sesión/rol.",
      ).toBe(true);
    },
  );
});

describe("app/api/admin/**/route.ts — toda mutación pasa por conAuditoria()", () => {
  const routes = findFiles(API_ADMIN, "route.ts");

  // Funciones mutadoras conocidas hoy en lib/data/admin/*: activarNivel
  // (usuarios.ts) y reprocesarPago (pagos.ts). Ambas empiezan con un verbo de
  // mutación (activar/reprocesar) y devuelven la forma que conAuditoria()
  // espera — a diferencia de listarUsuarios/obtenerUsuario/listarPagos/
  // obtenerPago/contarPagosSinAplicar/sanitizarPayloadRaw, que son de sólo
  // lectura o funciones puras.
  const FUNCIONES_MUTADORAS = ["activarNivel", "reprocesarPago"];

  it.each(routes.map((r) => [rel(r), r] as const))(
    "%s: si importa una función mutadora, también llama a conAuditoria(",
    (_label, routePath) => {
      const content = readFileSync(routePath, "utf8");
      const codigo = sinComentarios(content);

      const mutadorasImportadas = FUNCIONES_MUTADORAS.filter((fn) => codigo.includes(fn));
      if (mutadorasImportadas.length === 0) return;

      expect(
        codigo.includes("conAuditoria("),
        `${rel(routePath)} usa ${mutadorasImportadas.join(", ")} pero no llama a conAuditoria() ` +
          "(fuera de comentarios). Toda mutación del panel de admin (activarNivel, reprocesarPago, " +
          "o cualquier función nueva de lib/data/admin/*) tiene que ejecutarse DENTRO del closure " +
          "que recibe conAuditoria() — es el único mecanismo que garantiza la fila de " +
          "admin_audit_log. Envolvé la llamada: `await conAuditoria(admin, meta, () => " +
          `${mutadorasImportadas[0]}(admin, ...))\`.`,
      ).toBe(true);
    },
  );
});
