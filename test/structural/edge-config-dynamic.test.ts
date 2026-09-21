// VGRP-55 punto 3 — bug real encontrado: app/(app)/comprar/page.tsx leía
// getPrecios() (Edge Config) sin declarar `dynamic`/usar ninguna API dinámica
// de Next, así que Next la prerenderizaba en build time — congelando el
// PRECIO de ese momento para siempre, hasta el próximo deploy. El equipo ya
// había encontrado y arreglado el mismo bug en app/(auth)/registro/page.tsx
// (flags.registro_habilitado); se repitió, esta vez sobre el número que
// cobra.
//
// Este test es el "más importante" del punto 3: sin él, el bug puede volver
// (una page nueva que lea Edge Config y no declare por qué es dinámica) y
// nadie se entera hasta que alguien cambie un precio/flag en el dashboard de
// Vercel y no vea el efecto.
//
// Test estructural: recorre TODOS los app/**/page.tsx del repo (no una lista
// a mano, que queda desactualizada en silencio) y, para cada uno que importe
// getPrecios/getFlags/getLinks de lib/config, exige que el archivo declare
// `export const dynamic = "force-dynamic"` O use alguna API dinámica real de
// Next (cookies()/getVerifiedClaims(), o el parámetro `searchParams`) — con
// cualquiera de las dos, Next no puede prerenderizar la página en build time.

import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = path.resolve(__dirname, "../..");
const APP_DIR = path.join(ROOT, "app");

/** Todos los app/**\/page.tsx del repo, caminando el árbol real (node:fs) — no
 *  una lista a mano, que queda desactualizada en silencio con cada page nueva. */
function encontrarPages(dir: string): string[] {
  const out: string[] = [];
  for (const entrada of readdirSync(dir)) {
    const full = path.join(dir, entrada);
    if (statSync(full).isDirectory()) {
      if (entrada === "node_modules") continue;
      out.push(...encontrarPages(full));
    } else if (entrada === "page.tsx") {
      out.push(full);
    }
  }
  return out;
}

function sinComentarios(content: string): string {
  return content.replace(/\/\*[\s\S]*?\*\//g, "").replace(/\/\/.*/g, "");
}

function leeEdgeConfig(codigo: string): boolean {
  return /\b(getPrecios|getFlags|getLinks)\s*\(/.test(codigo);
}

function esDinamica(codigo: string): boolean {
  return (
    /dynamic\s*=\s*["']force-dynamic["']/.test(codigo) ||
    /\bcookies\s*\(/.test(codigo) ||
    /\bgetVerifiedClaims\s*\(/.test(codigo) ||
    /searchParams/.test(codigo)
  );
}

function rel(p: string): string {
  return path.relative(ROOT, p).split(path.sep).join("/");
}

describe("toda page.tsx que lee Edge Config es dinámica (VGRP-55 punto 3)", () => {
  const pages = encontrarPages(APP_DIR);
  // Leído y limpiado de comentarios UNA vez por archivo — los tres `it` de
  // abajo reusan esto en vez de volver a leer/parsear cada page.tsx por test.
  const codigos = pages.map((p) => sinComentarios(readFileSync(p, "utf8")));

  it("recorrido de archivos real (ancla — si esto es bajo, el walker está roto y el resto no prueba nada)", () => {
    expect(pages.length).toBeGreaterThan(5);
  });

  it("al menos una page.tsx real lee Edge Config (ancla — si esto es 0, la regex de arriba dejó de matchear y el test de abajo no prueba nada)", () => {
    const encontrado = codigos.filter(leeEdgeConfig);
    expect(encontrado.length).toBeGreaterThan(0);
  });

  it("cada page.tsx que lee Edge Config es dinámica por alguna razón real", () => {
    const violaciones = pages
      .filter((_, i) => leeEdgeConfig(codigos[i]) && !esDinamica(codigos[i]))
      .map(rel);

    expect(
      violaciones,
      `${violaciones.join(", ")} lee Edge Config (getPrecios/getFlags/getLinks) sin declarar ` +
        `\`export const dynamic = "force-dynamic"\` ni usar cookies()/getVerifiedClaims()/` +
        "searchParams — Next la va a prerenderizar en build time y va a congelar ese valor " +
        "hasta el próximo deploy (mismo bug que tuvo app/(app)/comprar/page.tsx).",
    ).toEqual([]);
  });
});
