#!/usr/bin/env node
// VGRP-56 punto 9 — presupuesto de First Load JS por ruta, en CI. Parsea la
// tabla que "next build" ya imprime (no reinventa el cálculo de Next leyendo
// manifests a mano) y falla si alguna ruta se pasa de su presupuesto.
//
// Uso: pnpm build 2>&1 | tee build-output.log && node scripts/check-bundle-budget.mjs build-output.log
//
// Los números de DEFAULT_BUDGET_KB y las excepciones salen de la medición
// real post Bloque 10 (docs/RENDIMIENTO.md, tabla de VGRP-56) más un margen
// chico y honesto — no son un techo arbitrario. Subir un número acá es una
// decisión consciente que se discute en el PR, no un arreglo de CI en rojo.

import { readFileSync } from "node:fs";

const DEFAULT_BUDGET_KB = 200;

// El shared chunk viaja en TODAS las rutas — un presupuesto por ruta no lo
// cubre solo (el default de 200 tiene margen para absorberlo sin que ninguna
// ruta lo note), así que se chequea también aparte, explícito.
const SHARED_BUDGET_KB = 195;

// Rutas con un presupuesto propio, más alto que el default, porque ya está
// medido y justificado por qué pesan más (ver docs/RENDIMIENTO.md).
const BUDGET_OVERRIDES_KB = {
  // Doble panel de config con varios formularios (VGRP-40) — 210 kB medido
  // tras el Bloque 10 completo.
  "/admin/config": 215,
  // Arrastra @supabase/ssr + supabase-js para el polling con refreshSession()
  // en el browser (lib/auth/browser.ts) — anotado como fuera de alcance de
  // este bloque en el propio ticket VGRP-56, medido en 256 kB.
  "/comprar/pendiente": 265,
};

const ROUTE_LINE = /^[┌├└│]\s*(?:[○●ƒ]\s+)?(\S+)\s+([\d.]+\s?(?:B|kB|MB))\s+([\d.]+\s?(?:B|kB|MB))/;
const SHARED_LINE = /^\+\s*First Load JS shared by all\s+([\d.]+\s?(?:B|kB|MB))/;

function toKb(sizeText) {
  const m = sizeText.trim().match(/^([\d.]+)\s?(B|kB|MB)$/);
  if (!m) throw new Error(`No pude parsear el tamaño: "${sizeText}"`);
  const [, num, unit] = m;
  const value = Number.parseFloat(num);
  if (unit === "B") return value / 1024;
  if (unit === "MB") return value * 1024;
  return value;
}

function main() {
  const logPath = process.argv[2];
  if (!logPath) {
    console.error("Uso: check-bundle-budget.mjs <archivo-de-log-de-next-build>");
    process.exit(2);
  }

  let log;
  try {
    log = readFileSync(logPath, "utf8");
  } catch (err) {
    console.error(`No pude leer "${logPath}": ${err.message}`);
    process.exit(2);
  }
  const lines = log.split("\n");

  const routes = [];
  let sharedKb = null;

  for (const line of lines) {
    const shared = line.match(SHARED_LINE);
    if (shared) {
      sharedKb = toKb(shared[1]);
      continue;
    }
    const match = line.match(ROUTE_LINE);
    if (!match) continue;
    const [, route, , firstLoadJsText] = match;
    if (!route.startsWith("/")) continue;
    routes.push({ route, firstLoadJsKb: toKb(firstLoadJsText) });
  }

  if (routes.length === 0 || sharedKb === null) {
    console.error(
      "No pude leer la tabla de rutas y/o la línea de 'First Load JS shared " +
        "by all' del log — ¿el formato de `next build` cambió? Revisá los " +
        "regex ROUTE_LINE/SHARED_LINE de scripts/check-bundle-budget.mjs " +
        "contra el log real antes de asumir que el build está bien.",
    );
    process.exit(2);
  }

  console.log(
    `Presupuesto de First Load JS: ${routes.length} rutas leídas, shared ${sharedKb.toFixed(1)} kB`,
  );

  const excesos = [];
  if (sharedKb > SHARED_BUDGET_KB) {
    excesos.push({ route: "(shared by all)", firstLoadJsKb: sharedKb, budget: SHARED_BUDGET_KB });
  }
  for (const { route, firstLoadJsKb } of routes) {
    const budget = BUDGET_OVERRIDES_KB[route] ?? DEFAULT_BUDGET_KB;
    if (firstLoadJsKb > budget) {
      excesos.push({ route, firstLoadJsKb, budget });
    }
  }

  if (excesos.length > 0) {
    console.error("\n✗ Rutas que superan su presupuesto de First Load JS:\n");
    for (const { route, firstLoadJsKb, budget } of excesos) {
      const exceso = (firstLoadJsKb - budget).toFixed(1);
      console.error(
        `  ${route}: ${firstLoadJsKb.toFixed(1)} kB > ${budget} kB (excede por ${exceso} kB)`,
      );
    }
    console.error(
      "\nSi el crecimiento es real y justificado, subí el presupuesto de esa " +
        "ruta en scripts/check-bundle-budget.mjs y explicá por qué en el PR " +
        "(no es un arreglo de CI en rojo, es una decisión consciente) — y " +
        "sumá la medición a docs/RENDIMIENTO.md. Si no está justificado, es " +
        "una regresión: revertí el cambio que la causó.",
    );
    process.exit(1);
  }

  console.log("✓ Todas las rutas dentro de su presupuesto de First Load JS.");
}

main();
