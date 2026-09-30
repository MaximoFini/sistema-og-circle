// VGRP-58 — genera el fixture de paridad del motor marítimo corriendo el
// código ORIGINAL del repo vegroup (no el port):
//
//   node scripts/cotizador/generar-fixtures-maritimo.mjs <ruta-al-clon-de-vegroup>
//
// Escribe (y deja formateado con Biome, para que `pnpm lint` no lo marque):
//   - test/fixtures/cotizador/maritimo.json   ← src/lib/calcMaritimo.js + tarifasMaritimo.js
//
// lib/cotizador/calcMaritimo.test.ts corre el port con las mismas entradas y
// exige igualdad exacta. Si el port se desvía del original en una sola
// cuenta, el test falla.
//
// Cuándo correrlo: al portar un cambio del repo vegroup (ver
// lib/cotizador/ORIGEN.md). NO se corre en CI: el clon es privado y el
// fixture commiteado ES la referencia. No modifica nada del clon.
//
// Los casos replican los que cubre scripts/calcMaritimo.test.mjs del
// original (40 comprobaciones: bloque fijo, TN/m³, caso "set de
// herramientas", invariantes con FOB 0, contenedorSugerido, sugerirPuerto,
// calcAmbas con/sin tarifa de full) — cada caso acá compara el objeto de
// resultado COMPLETO (`toEqual` exacto), así que cubre más verificaciones
// individuales que "casos" tiene la lista.
//
// Es .mjs (no .ts) a propósito: importa JS plano del clon y no hace falta
// tsx ni que el repo tenga `allowJs`.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const COMMIT_ESPERADO = "b550803";
const REPO_ORIGEN = "emilianoverabusiness-blip/vegroup";

const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dirFixtures = path.join(raizRepo, "test", "fixtures", "cotizador");

const clon = process.argv[2];
if (!clon) {
  console.error(
    "Uso: node scripts/cotizador/generar-fixtures-maritimo.mjs <ruta-al-clon-de-vegroup>",
  );
  process.exit(1);
}
const clonAbs = path.resolve(clon);
const calcPath = path.join(clonAbs, "src", "lib", "calcMaritimo.js");
const tarifasPath = path.join(clonAbs, "src", "lib", "tarifasMaritimo.js");
for (const p of [calcPath, tarifasPath]) {
  if (!existsSync(p)) {
    console.error(`No encuentro ${p}. ¿Es la ruta a un clon de ${REPO_ORIGEN}?`);
    process.exit(1);
  }
}

// Commit del clon: queda anotado en el fixture. Si no es el que registra
// ORIGEN.md, avisamos (puede ser a propósito: se está portando un cambio).
let commit = "desconocido";
try {
  commit = execSync("git rev-parse --short HEAD", { cwd: clonAbs, encoding: "utf8" }).trim();
} catch {
  // sin git: seguimos, queda "desconocido"
}
if (!commit.startsWith(COMMIT_ESPERADO)) {
  console.warn(
    `[aviso] El clon está en ${commit}, no en ${COMMIT_ESPERADO}. Si es a propósito, actualizá lib/cotizador/ORIGEN.md.`,
  );
}

const calcMaritimo = await import(pathToFileURL(calcPath).href);
const tarifasMaritimo = await import(pathToFileURL(tarifasPath).href);

// ── Verificación: el JSON tiene que representar el resultado sin pérdida ──
function verificarSerializable(valor, ruta = "$") {
  if (typeof valor === "number") {
    if (!Number.isFinite(valor) || Object.is(valor, -0)) {
      throw new Error(`Valor no serializable sin pérdida en ${ruta}: ${valor}`);
    }
    return;
  }
  if (valor === undefined) throw new Error(`undefined en ${ruta}`);
  if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) verificarSerializable(v, `${ruta}.${k}`);
  }
}

const casos = [];
function agregar(id, fn, args) {
  let esperado;
  switch (fn) {
    case "medidas":
      esperado = calcMaritimo.medidas(...args);
      break;
    case "calcMaritimo":
      esperado = calcMaritimo.calcMaritimo(...args);
      break;
    case "calcAmbas":
      esperado = calcMaritimo.calcAmbas(...args);
      break;
    case "contenedorSugerido":
      esperado = calcMaritimo.contenedorSugerido(...args);
      break;
    case "sugerirPuerto":
      esperado = tarifasMaritimo.sugerirPuerto(...args);
      break;
    default:
      throw new Error(`fn desconocida: ${fn}`);
  }
  verificarSerializable(args, `${id}.args`);
  verificarSerializable(esperado, `${id}.esperado`);
  casos.push({ id, fn, args, esperado });
}

// ═════════════════════════════════════════════════════════════════════════
// medidas() — TN/m³ facturables
// ═════════════════════════════════════════════════════════════════════════
agregar("medidas/manda-volumen", "medidas", [{ volumenM3: 8.501, pesoKg: 5500 }]);
agregar("medidas/manda-peso", "medidas", [{ volumenM3: 2, pesoKg: 20400 }]);

// ═════════════════════════════════════════════════════════════════════════
// calcMaritimo() — caso base: set de herramientas
// 8,501 m³ · 5.500 kg · FOB 18.000 · DIE 18% · TE 3% · IVA 21% · TC 1.512
// ═════════════════════════════════════════════════════════════════════════
const herramientas = {
  volumenM3: 8.501,
  pesoKg: 5500,
  fob: 18000,
  unidades: 1,
  die: 18,
  te: 3,
  iva: 21,
  tc: 1512,
};
agregar("calcMaritimo/set-de-herramientas", "calcMaritimo", [herramientas]);

// FOB 0: no debe romper ni dar NaN.
agregar("calcMaritimo/fob-cero", "calcMaritimo", [
  { volumenM3: 1, pesoKg: 0, fob: 0, unidades: 1, die: 0, te: 0, iva: 21, tc: 1512 },
]);

// Con override de flete (cotización cerrada del despachante).
agregar("calcMaritimo/flete-override", "calcMaritimo", [{ ...herramientas, fleteUsd: 4200 }]);

// Sin IVA explícito (usa default 21).
agregar("calcMaritimo/sin-iva-usa-21", "calcMaritimo", [
  { volumenM3: 3, pesoKg: 1200, fob: 5000, unidades: 2, die: 10, te: 3 },
]);

// TN/m³ con decimales-con-coma (strings, como manda el formulario).
agregar("calcMaritimo/decimales-coma", "calcMaritimo", [
  {
    volumenM3: "8,501",
    pesoKg: "5500",
    fob: "18000",
    unidades: "1",
    die: 18,
    te: 3,
    iva: 21,
    tc: "1512",
  },
]);

// ═════════════════════════════════════════════════════════════════════════
// contenedorSugerido()
// ═════════════════════════════════════════════════════════════════════════
agregar("contenedorSugerido/20-dry", "contenedorSugerido", [{ m3: 8.5, kg: 5500 }]);
agregar("contenedorSugerido/40-dry", "contenedorSugerido", [{ m3: 40, kg: 8000 }]);
agregar("contenedorSugerido/40hq", "contenedorSugerido", [{ m3: 62, kg: 9000 }]);
agregar("contenedorSugerido/limita-peso", "contenedorSugerido", [{ m3: 5, kg: 27000 }]);
agregar("contenedorSugerido/necesita-3", "contenedorSugerido", [{ m3: 150, kg: 5000 }]);

// ═════════════════════════════════════════════════════════════════════════
// sugerirPuerto() — provincia/ciudad para las tres cuencas + sin match
// ═════════════════════════════════════════════════════════════════════════
agregar("sugerirPuerto/jinan-shandong", "sugerirPuerto", [
  "No. 128 Jinshui Road, Jinan, Shandong, China",
]);
agregar("sugerirPuerto/tianjin", "sugerirPuerto", ["Beichen District, Tianjin"]);
agregar("sugerirPuerto/yiwu-zhejiang", "sugerirPuerto", ["Futian Market, Yiwu, Zhejiang"]);
agregar("sugerirPuerto/suzhou-jiangsu", "sugerirPuerto", [
  "Wuzhong District, Suzhou, Jiangsu Province",
]);
agregar("sugerirPuerto/dongguan-guangdong", "sugerirPuerto", ["Houjie Town, Dongguan, Guangdong"]);
agregar("sugerirPuerto/xiamen-fujian", "sugerirPuerto", ["Huli District, Xiamen, Fujian"]);
agregar("sugerirPuerto/shanghai-con-tilde", "sugerirPuerto", ["Pudong, Shanghái"]);
agregar("sugerirPuerto/desconocida", "sugerirPuerto", ["Calle Falsa 123, Springfield"]);
agregar("sugerirPuerto/vacio", "sugerirPuerto", [""]);

// ═════════════════════════════════════════════════════════════════════════
// calcAmbas() — consolidado + full
// ═════════════════════════════════════════════════════════════════════════
agregar("calcAmbas/sin-tarifa-full-estimado", "calcAmbas", [herramientas]);
agregar("calcAmbas/con-tarifa-full", "calcAmbas", [{ ...herramientas, fleteFullUsd: 4200 }]);

const maritimo = {
  _comentario:
    "GENERADO por scripts/cotizador/generar-fixtures-maritimo.mjs con calcMaritimo.js y tarifasMaritimo.js ORIGINALES. No editar a mano.",
  origen: {
    repo: REPO_ORIGEN,
    commit,
    archivos: ["src/lib/calcMaritimo.js", "src/lib/tarifasMaritimo.js"],
  },
  constantes: {
    SUMA_FIJOS: tarifasMaritimo.SUMA_FIJOS,
    IVA_FIJOS: tarifasMaritimo.IVA_FIJOS,
    ARANCEL_SIM: tarifasMaritimo.ARANCEL_SIM,
    FLETE: tarifasMaritimo.FLETE,
  },
  casos,
};

// ── Escritura ────────────────────────────────────────────────────────────
const archivo = path.join(dirFixtures, "maritimo.json");
writeFileSync(archivo, `${JSON.stringify(maritimo, null, 2)}\n`);
try {
  execSync(`pnpm biome format --write ${JSON.stringify(archivo)}`, {
    cwd: raizRepo,
    stdio: "inherit",
  });
} catch {
  console.warn("[aviso] No se pudo correr Biome; corré `pnpm format` antes de commitear.");
}

// Sanidad: lo escrito se vuelve a leer igual.
JSON.parse(readFileSync(archivo, "utf8"));

console.log(`OK — ${casos.length} casos del motor marítimo (clon en ${commit}).`);
