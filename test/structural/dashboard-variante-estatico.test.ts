// VGRP-50 — ancla el "por qué" de app/(app)/dashboard/[variante]/page.tsx (comentario de
// cabecera, VGRP-27): la ruta es 100% prerenderizada (generateStaticParams +
// dynamicParams=false), así que el nivel llega por el segmento de la URL, nunca por
// sesión. Si algún día alguien agrega un cookies()/headers()/getVerifiedClaims() en
// cualquier archivo del árbol que esta página renderiza, la garantía de "esto sale del
// CDN" deja de ser cierta aunque el build siga pasando.
//
// Test estructural: recorre el grafo de imports REAL (node:fs + una regex de imports),
// arrancando en la página y siguiendo sólo imports relativos o con alias "@/" hacia
// archivos .ts/.tsx del repo (nunca paquetes externos ni CSS/imágenes). Se prefiere
// caminar el grafo real a mantener una lista de archivos a mano: una lista a mano queda
// desactualizada en silencio en cuanto alguien agrega un componente nuevo al árbol.
//
// Un archivo marcado `"use server";` (Server Action) es un LÍMITE, no parte del árbol de
// render: Next.js lo reemplaza, del lado del cliente, por un stub que hace un RPC — el
// cuerpo real (acá, components/video/_actions.ts, que sí usa getVerifiedClaims()) sólo
// corre cuando alguien lo INVOCA explícitamente. ProgresoVideosProvider lo invoca dentro
// de un useEffect, después de hidratar — nunca durante el render estático (ver el
// comentario de cabecera de ese archivo) — por eso este test no desciende a esos
// archivos ni los revisa, y lo confirma con una aserción explícita más abajo.

import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const PAGE = path.join(ROOT, "app/(app)/dashboard/[variante]/page.tsx");
const ACTIONS_EXCLUIDO = path.join(ROOT, "components/video/_actions.ts");
const EXTENSIONES = [".tsx", ".ts"];

function rel(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

/** Misma idea que test/structural/server-only-boundary.test.ts / admin-surface.test.ts —
 *  copiada local a propósito (convención del repo: cada test estructural autocontenido). */
function sinComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

function primeraLineaDeCodigo(content: string): string {
  const codigo = sinComentarios(content);
  for (const linea of codigo.split(/\r?\n/)) {
    const t = linea.trim();
    if (t !== "") return t;
  }
  return "";
}

function esUseServer(content: string): boolean {
  return primeraLineaDeCodigo(content) === '"use server";';
}

function extraerEspecificadores(content: string): string[] {
  const out: string[] = [];
  const regex = /(?:from|import)\s+["']([^"']+)["']/g;
  let m = regex.exec(content);
  while (m !== null) {
    out.push(m[1]);
    m = regex.exec(content);
  }
  return out;
}

/** Resuelve un specifier de import a un archivo .ts/.tsx real del repo, o null si es un
 *  paquete externo, un asset no-código (css/json/imagen), o no se pudo resolver. */
function resolverImport(desdeArchivo: string, especificador: string): string | null {
  if (!especificador.startsWith(".") && !especificador.startsWith("@/")) return null;
  if (/\.(css|json|svg|png|jpe?g|webp|gif|ico)$/i.test(especificador)) return null;

  const base = especificador.startsWith("@/")
    ? path.join(ROOT, especificador.slice(2))
    : path.resolve(path.dirname(desdeArchivo), especificador);

  for (const ext of EXTENSIONES) {
    if (existsSync(base + ext)) return base + ext;
  }
  for (const ext of EXTENSIONES) {
    const indexPath = path.join(base, `index${ext}`);
    if (existsSync(indexPath) && statSync(indexPath).isFile()) return indexPath;
  }
  return null;
}

function recorrerArbol(entrada: string): { visitados: Map<string, string>; excluidos: string[] } {
  const visitados = new Map<string, string>();
  const excluidos: string[] = [];
  const pendientes = [entrada];

  while (pendientes.length > 0) {
    const actual = pendientes.pop() as string;
    if (visitados.has(actual) || excluidos.includes(actual)) continue;

    const content = readFileSync(actual, "utf8");

    if (actual !== entrada && esUseServer(content)) {
      excluidos.push(actual);
      continue;
    }

    visitados.set(actual, content);
    for (const especificador of extraerEspecificadores(content)) {
      const resuelto = resolverImport(actual, especificador);
      if (resuelto && !visitados.has(resuelto)) pendientes.push(resuelto);
    }
  }

  return { visitados, excluidos };
}

describe("estatismo de /dashboard/[variante] (VGRP-27/29/50)", () => {
  it("generateStaticParams y dynamicParams=false están declarados en la página", () => {
    const codigo = sinComentarios(readFileSync(PAGE, "utf8"));

    expect(
      /function\s+generateStaticParams/.test(codigo),
      `No se encontró \`export function generateStaticParams\` en ${rel(PAGE)}.`,
    ).toBe(true);
    expect(
      /dynamicParams\s*=\s*false/.test(codigo),
      `No se encontró \`dynamicParams = false\` en ${rel(PAGE)}.`,
    ).toBe(true);
  });

  const { visitados, excluidos } = recorrerArbol(PAGE);
  const archivos = Array.from(visitados.keys());

  it("el recorrido visitó una cantidad razonable de archivos del árbol real (ancla — si esto es bajo, el resolver de imports está roto y el resto de este describe no prueba nada)", () => {
    expect(archivos.length).toBeGreaterThan(5);
  });

  it("components/video/_actions.ts (Server Action, límite de RPC) quedó excluido del recorrido a propósito", () => {
    expect(excluidos).toContain(ACTIONS_EXCLUIDO);
  });

  it("_actions.ts SÍ usa getVerifiedClaims() (ancla — confirma que la exclusión de arriba no está tapando un archivo vacío)", () => {
    const codigo = sinComentarios(readFileSync(ACTIONS_EXCLUIDO, "utf8"));
    expect(codigo.includes("getVerifiedClaims(")).toBe(true);
  });

  it.each(archivos.map((a) => [rel(a), a] as const))(
    "%s no llama a cookies()/headers()/getVerifiedClaims()",
    (_label, archivo) => {
      const codigo = sinComentarios(visitados.get(archivo) as string);
      const violaciones = ["cookies(", "headers(", "getVerifiedClaims("].filter((fn) =>
        codigo.includes(fn),
      );

      expect(
        violaciones,
        `${rel(archivo)} llama a ${violaciones.join(", ")} — este archivo es parte del árbol de ` +
          `render de ${rel(PAGE)} (prerenderizada: generateStaticParams + dynamicParams=false). Si ` +
          "de verdad hace falta sesión acá, resolvelo como AgentesGrid/UserFooter (fetch de cliente a " +
          "un Route Handler dinámico DESPUÉS de hidratar), no leyendo cookies/claims durante el " +
          "render estático.",
      ).toEqual([]);
    },
  );
});
