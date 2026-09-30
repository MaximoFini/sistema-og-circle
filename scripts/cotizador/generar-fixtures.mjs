// VGRP-57 — genera los fixtures de paridad del cotizador corriendo el código
// ORIGINAL del repo vegroup (no el port):
//
//   node scripts/cotizador/generar-fixtures.mjs <ruta-al-clon-de-vegroup>
//
// Escribe (y deja formateados con Biome, para que `pnpm lint` no los marque):
//   - test/fixtures/cotizador/courier.json        ← src/lib/calc.js
//   - test/fixtures/cotizador/ncm-busquedas.json  ← src/lib/ncmSearch.js + src/data/ncm.js
//
// lib/cotizador/calc.test.ts y lib/cotizador/ncm/search.test.ts corren el
// port con las mismas entradas y exigen igualdad exacta. Si el port se
// desvía del original en una sola cuenta, el test falla.
//
// Cuándo correrlo: al portar un cambio del repo vegroup (ver
// lib/cotizador/ORIGEN.md). NO se corre en CI: el clon es privado y el
// fixture commiteado ES la referencia. No modifica nada del clon.
//
// Es .mjs (no .ts) a propósito: importa JS plano del clon y no hace falta
// tsx ni que el repo tenga `allowJs`.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { register } from "node:module";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const COMMIT_ESPERADO = "b550803";
const REPO_ORIGEN = "emilianoverabusiness-blip/vegroup";

const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const dirFixtures = path.join(raizRepo, "test", "fixtures", "cotizador");

const clon = process.argv[2];
if (!clon) {
  console.error("Uso: node scripts/cotizador/generar-fixtures.mjs <ruta-al-clon-de-vegroup>");
  process.exit(1);
}
const clonAbs = path.resolve(clon);
const calcPath = path.join(clonAbs, "src", "lib", "calc.js");
const searchPath = path.join(clonAbs, "src", "lib", "ncmSearch.js");
const ncmBasePath = path.join(clonAbs, "src", "data", "ncm.js");
for (const p of [calcPath, searchPath, ncmBasePath]) {
  if (!existsSync(p)) {
    console.error(`No encuentro ${p}. ¿Es la ruta a un clon de ${REPO_ORIGEN}?`);
    process.exit(1);
  }
}

// Commit del clon: queda anotado en los fixtures. Si no es el que registra
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

// ── Shim para el `import('./ncm.json')` del original ──────────────────────
// En Node 22 importar un .json sin `with { type: "json" }` tira
// ERR_IMPORT_ATTRIBUTE_MISSING (Vite no lo exige, por eso el original no lo
// tiene). En vez de tocar el clon, un hook de carga sirve cualquier .json de
// adentro del clon como un módulo ESM con `export default <json>`, que es lo
// mismo que ve el código original bajo Vite (`mod.default`).
const hooks = `
const PREFIJO = ${JSON.stringify(pathToFileURL(clonAbs).href)};
import { readFile } from "node:fs/promises";
export async function load(url, context, nextLoad) {
  if (url.startsWith(PREFIJO) && url.endsWith(".json")) {
    const texto = await readFile(new URL(url), "utf8");
    return { format: "module", source: "export default " + texto + ";", shortCircuit: true };
  }
  return nextLoad(url, context);
}
`;
register(`data:text/javascript,${encodeURIComponent(hooks)}`);

const calc = await import(pathToFileURL(calcPath).href);
const ncmSearch = await import(pathToFileURL(searchPath).href);
const ncmBase = await import(pathToFileURL(ncmBasePath).href);

// ── Verificación: el JSON tiene que representar el resultado sin pérdida ──
// NaN/Infinity se vuelven null y -0 se vuelve 0 al serializar; si el original
// llegara a producirlos, el fixture mentiría. Preferimos cortar acá.
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

// ═════════════════════════════════════════════════════════════════════════
// courier.json — motor de cálculo
// ═════════════════════════════════════════════════════════════════════════

// Envíos. Van como strings, igual que los arma AgentQuote.handleQuote a
// partir del formulario (cajas es número: AgentQuote lo redondea antes).
const ENVIOS = {
  chico: {
    fob: "250",
    pesoKg: "2.5",
    unidades: "3",
    largo: "30",
    ancho: "20",
    alto: "15",
    cajas: 1,
  },
  "volumetrico-mayor-al-real": {
    fob: "800",
    pesoKg: "3",
    unidades: "10",
    largo: "60",
    ancho: "50",
    alto: "40",
    cajas: 2,
  },
  "fob-cero": {
    fob: "0",
    pesoKg: "1",
    unidades: "1",
    largo: "10",
    ancho: "10",
    alto: "10",
    cajas: 1,
  },
  "decimales-con-coma": {
    fob: "1234,56",
    pesoKg: "12,5",
    unidades: "7",
    largo: "45,5",
    ancho: "30",
    alto: "22,3",
    cajas: 3,
  },
  grande: {
    fob: "15000",
    pesoKg: "120",
    unidades: "500",
    largo: "80",
    ancho: "60",
    alto: "50",
    cajas: 6,
  },
  "peso-cero": {
    fob: "100",
    pesoKg: "0",
    unidades: "2",
    largo: "20",
    ancho: "20",
    alto: "20",
    cajas: 1,
  },
  "unidades-vacias": {
    fob: "90",
    pesoKg: "0.8",
    unidades: "",
    largo: "25",
    ancho: "15",
    alto: "10",
    cajas: 1,
  },
  // Elegido porque (fob + peso × 2,5) × 1,01 ≠ fob × 1,01 + peso × 2,5 × 1,01
  // en floats: si alguien "simplifica" el CIF distribuyendo, esto lo detecta.
  "sensible-al-orden-de-operaciones": {
    fob: "777.7",
    pesoKg: "3",
    unidades: "9",
    largo: "41",
    ancho: "33",
    alto: "27",
    cajas: 2,
  },
};

// Tipos de cambio (strings, como el formulario).
const TCS = {
  "sin-tc": { dolarBN: "", dolarCCL: "" },
  "bna-igual-ccl": { dolarBN: "1050", dolarCCL: "1050" },
  "ccl-distinto-de-bna": { dolarBN: "1050", dolarCCL: "1210.5" },
  "ccl-vacio-usa-bna": { dolarBN: "1187,25", dolarCCL: "" },
};

// Alícuotas: como las pasa AgentQuote desde la posición elegida
// (die/te/iva números; impInternos string, como viene en la base NCM).
// Valores tomados de combinaciones reales de la base (DIE 35/16/0/20,
// IVA 21/10,5, II 9.5/20/70).
const ALICUOTAS = {
  "die35-te3-iva21": { die: 35, te: 3, iva: 21, impInternosNom: "" },
  "die16-te3-iva10.5-ii9.5": { die: 16, te: 3, iva: 10.5, impInternosNom: "9.5" },
  "die0-te0-iva21-ii20": { die: 0, te: 0, iva: 21, impInternosNom: "20" },
  "die20-te3-iva21-ii70": { die: 20, te: 3, iva: 21, impInternosNom: "70" },
};

// Pequeños envíos: AgentQuote fija `selected = PEQUEÑOS_ENVIOS` y calcula con
// calcAllRoutes usando sus alícuotas (impInternos es el número 0 ahí).
const PE = calc.PEQUEÑOS_ENVIOS;
const alicuotasPequenos = {
  die: PE.die,
  te: PE.te,
  iva: PE.iva,
  impInternosNom: PE.impInternos,
};

const casos = [];
function agregar(id, fn, args) {
  const rutaPorId = (rid) => calc.ROUTES.find((r) => r.id === rid);
  let esperado;
  switch (fn) {
    case "calcAllRoutes":
      esperado = calc.calcAllRoutes(...args);
      break;
    case "calcAllIntegral":
      esperado = calc.calcAllIntegral(...args);
      break;
    case "calcRoute":
      esperado = calc.calcRoute(args[0], rutaPorId(args[1]), ...args.slice(2));
      break;
    case "calcIntegral":
      esperado = calc.calcIntegral(args[0], rutaPorId(args[1]));
      break;
    default:
      throw new Error(`fn desconocida: ${fn}`);
  }
  verificarSerializable(args, `${id}.args`);
  verificarSerializable(esperado, `${id}.esperado`);
  casos.push({ id, fn, args, esperado });
}

// 1) Régimen general: todos los envíos × todas las alícuotas, con CCL ≠ BNA.
for (const [e, envio] of Object.entries(ENVIOS)) {
  for (const [a, ali] of Object.entries(ALICUOTAS)) {
    agregar(`general/${e}/${a}/ccl-distinto-de-bna`, "calcAllRoutes", [
      { ...envio, ...TCS["ccl-distinto-de-bna"], ...ali },
    ]);
  }
}
// 2) Régimen general: todos los envíos × los otros tipos de cambio.
for (const [e, envio] of Object.entries(ENVIOS)) {
  for (const t of ["sin-tc", "bna-igual-ccl", "ccl-vacio-usa-bna"]) {
    agregar(`general/${e}/die35-te3-iva21/${t}`, "calcAllRoutes", [
      { ...envio, ...TCS[t], ...ALICUOTAS["die35-te3-iva21"] },
    ]);
  }
}
// 3) Pequeños envíos: todos los envíos + el tope de PE_LIMITS (el motor no
//    lo aplica — lo corta la UI con `pequeñosOk` —, pero se fija qué da).
for (const [e, envio] of Object.entries(ENVIOS)) {
  agregar(`pequeños/${e}/bna-igual-ccl`, "calcAllRoutes", [
    { ...envio, ...TCS["bna-igual-ccl"], ...alicuotasPequenos },
  ]);
}
agregar("pequeños/en-el-tope", "calcAllRoutes", [
  {
    ...ENVIOS.chico,
    fob: String(calc.PE_LIMITS.maxFob),
    unidades: String(calc.PE_LIMITS.maxUnidades),
    ...TCS["ccl-distinto-de-bna"],
    ...alicuotasPequenos,
  },
]);
agregar("pequeños/sobre-el-tope", "calcAllRoutes", [
  {
    ...ENVIOS.chico,
    fob: String(calc.PE_LIMITS.maxFob + 0.01),
    unidades: String(calc.PE_LIMITS.maxUnidades + 1),
    ...TCS["ccl-distinto-de-bna"],
    ...alicuotasPequenos,
  },
]);

// 4) Courier integral: AgentQuote NO manda fob/die/te/iva.
const sinFob = ({ fob: _fob, ...resto }) => resto;
for (const [e, envio] of Object.entries(ENVIOS)) {
  for (const t of ["sin-tc", "ccl-distinto-de-bna"]) {
    agregar(`integral/${e}/${t}`, "calcAllIntegral", [{ ...sinFob(envio), ...TCS[t] }]);
  }
}
// Umbral INTEGRAL_THRESHOLD (10 kg), con y sin exceso volumétrico.
for (const peso of ["9.99", String(calc.INTEGRAL_THRESHOLD), "10.01"]) {
  agregar(`integral/umbral-${peso}kg/sin-exceso-vol`, "calcAllIntegral", [
    {
      pesoKg: peso,
      unidades: "4",
      largo: "30",
      ancho: "30",
      alto: "30",
      cajas: 1,
      dolarBN: "1050",
    },
  ]);
  agregar(`integral/umbral-${peso}kg/con-exceso-vol`, "calcAllIntegral", [
    {
      pesoKg: peso,
      unidades: "4",
      largo: "70",
      ancho: "60",
      alto: "50",
      cajas: 2,
      dolarBN: "1050",
    },
  ]);
}

// 5) calcRoute / calcIntegral de a una ruta, y parámetros que AgentQuote no
//    usa pero el motor exporta (diasTca, handlingOrigen, cfg, iva vacío…).
for (const r of calc.ROUTES) {
  agregar(`calcRoute/${r.id}/grande`, "calcRoute", [
    { ...ENVIOS.grande, ...TCS["ccl-distinto-de-bna"], ...ALICUOTAS["die16-te3-iva10.5-ii9.5"] },
    r.id,
  ]);
  agregar(`calcIntegral/${r.id}/volumetrico-mayor-al-real`, "calcIntegral", [
    { ...sinFob(ENVIOS["volumetrico-mayor-al-real"]), ...TCS["bna-igual-ccl"] },
    r.id,
  ]);
}
const baseExtra = { ...ENVIOS.chico, ...TCS["bna-igual-ccl"], ...ALICUOTAS["die35-te3-iva21"] };
const extras = {
  "dias-tca-5": { diasTca: "5" },
  "handling-origen-12": { handlingOrigen: "12" },
  "handling-origen-vacio-usa-default": { handlingOrigen: "" },
  "handling-origen-cero": { handlingOrigen: 0 },
  "iva-vacio-usa-21": { iva: "" },
  "iva-null-usa-21": { iva: null },
  "iva-cero": { iva: 0 },
  "ii-100-no-aplica": { impInternosNom: "100" },
  "ii-cero": { impInternosNom: "0" },
  "fob-no-numerico": { fob: "abc" },
  "cajas-cero": { cajas: 0 },
};
for (const [id, cambio] of Object.entries(extras)) {
  agregar(`extra/${id}`, "calcAllRoutes", [{ ...baseExtra, ...cambio }]);
}
// Sin iva en la entrada (clave ausente, no null): default 21.
{
  const { iva: _iva, ...sinIva } = baseExtra;
  agregar("extra/iva-ausente-usa-21", "calcAllRoutes", [sinIva]);
}
agregar("extra/cfg-propio", "calcAllRoutes", [
  baseExtra,
  { ...calc.CONFIG, pesoFactor: 3, seguroFactor: 1.02, diasTcaDefault: 3, comisionVegroupPorKg: 6 },
]);

// 6) Formateadores (misma ICU de Node en generación y en test).
const valoresFmt = [0, 1, 1234.567, 1234567.891, -5.5, 0.005, null];
const formatos = valoresFmt.map((n) => ({
  n,
  usd: calc.fmtUSD(n),
  ars: calc.fmtARS(n),
}));

const courier = {
  _comentario:
    "GENERADO por scripts/cotizador/generar-fixtures.mjs con el calc.js ORIGINAL. No editar a mano.",
  origen: { repo: REPO_ORIGEN, commit, archivo: "src/lib/calc.js" },
  constantes: {
    ROUTES: calc.ROUTES,
    CONFIG: calc.CONFIG,
    PEQUEÑOS_ENVIOS: calc.PEQUEÑOS_ENVIOS,
    PE_LIMITS: calc.PE_LIMITS,
    LABELS: calc.LABELS,
    INTEGRAL_THRESHOLD: calc.INTEGRAL_THRESHOLD,
    INTEGRAL_VOL_RATE: calc.INTEGRAL_VOL_RATE,
  },
  formatos,
  casos,
};

// ═════════════════════════════════════════════════════════════════════════
// ncm-busquedas.json — búsqueda en la base NCM
// ═════════════════════════════════════════════════════════════════════════

// maxSim 40 es el que usa AgentQuote.detect(); algunas van también con el
// default (60) para cubrir el corte por cupo.
const CONSULTAS = [
  ["zapas", 40],
  ["zapatillas", 40],
  ["Zapatillas de Running", 40],
  ["auriculares bluetooth", 40],
  ["celu", 40],
  ["funda de celular", 40],
  ["compu", 40],
  ["notebook", 40],
  ["notebook", undefined],
  ["remera algodon", 40],
  ["remera algodón", 40],
  ["8518.30", 40],
  ["8518", 40],
  ["8518.30.00.100U", 40],
  ["termo", 40],
  ["mate", 40],
  ["juguete peluche", 40],
  ["perfume", 40],
  ["cargador usb", 40],
  ["drone", 40],
  ["mochila", 40],
  ["reloj inteligente", 40],
  ["lampara led", 40],
  ["cartera cuero", 40],
  ["cartera cuero", undefined],
  ["xqzwvk plumbus", 40],
  ["de la", 40],
];

// maxSim 60 es el que usa AgentQuote; undefined = default (80).
const PARTIDAS = [
  [["8518", "8517"], 60],
  [["6404.11", "6402", "6403"], 60],
  [["9503"], 60],
  [["9503"], undefined],
  [["85.18", "abc", "12", 8471], 60],
  [["0000", "abcd"], 60],
  [[], 60],
];

const busquedas = [];
for (const [query, maxSim] of CONSULTAS) {
  const res = await ncmSearch.searchNCM(query, maxSim);
  busquedas.push({ query, maxSim: maxSim ?? null, resultado: res.map((r) => [r.sim, r.score]) });
}
const porPartidas = [];
for (const [partidas, maxSim] of PARTIDAS) {
  const res = await ncmSearch.searchByPartidas(partidas, maxSim);
  porPartidas.push({
    partidas,
    maxSim: maxSim ?? null,
    resultado: res.map((r) => [r.sim, r.score]),
  });
}

// Registros completos: fijan tupleToRecord() (descripción armada, antidumping…).
const primeraZapa = busquedas[0].resultado[0]?.[0];
const CODIGOS = [
  "8518.30.00.100U",
  "8518.30.00",
  "  8518.30.00  ",
  primeraZapa,
  "0101.21.00.500T",
  "9999.99.99",
  "",
];
// Además, un registro con antidumping y uno con impuestos internos, buscados
// en la base misma (así el caso existe sí o sí).
const headings = await ncmBase.loadBase();
let conAntidumping = null;
let conImpInternos = null;
for (const h of headings) {
  for (const s of h.suf) {
    if (!conAntidumping && s.antidumping) conAntidumping = s.sim;
    if (!conImpInternos && s.impInternos) conImpInternos = s.sim;
  }
}
CODIGOS.push(conAntidumping, conImpInternos);
const registros = CODIGOS.filter((c) => c != null).map((codigo) => ({
  codigo,
  registro: ncmBase.getNcm(codigo),
}));
const etiquetasLic = ["CS", "AO", "E", "O", "", "SENASA"].map((codigo) => ({
  codigo,
  etiqueta: ncmBase.licLabel(codigo),
}));

const ncm = {
  _comentario:
    "GENERADO por scripts/cotizador/generar-fixtures.mjs con ncmSearch.js y data/ncm.js ORIGINALES. No editar a mano. Resultados como [sim, score] en orden.",
  origen: { repo: REPO_ORIGEN, commit, archivos: ["src/lib/ncmSearch.js", "src/data/ncm.js"] },
  base: {
    posiciones: headings.length,
    sims: headings.reduce((n, h) => n + h.suf.length, 0),
  },
  busquedas,
  porPartidas,
  registros,
  etiquetasLic,
};

// ── Escritura ────────────────────────────────────────────────────────────
const salidas = [
  [path.join(dirFixtures, "courier.json"), courier],
  [path.join(dirFixtures, "ncm-busquedas.json"), ncm],
];
for (const [archivo, datos] of salidas) {
  writeFileSync(archivo, `${JSON.stringify(datos, null, 2)}\n`);
}
// Formato de Biome, para que el diff de un regenerado sea sólo de datos.
try {
  execSync(`pnpm biome format --write ${salidas.map(([a]) => JSON.stringify(a)).join(" ")}`, {
    cwd: raizRepo,
    stdio: "inherit",
  });
} catch {
  console.warn("[aviso] No se pudo correr Biome; corré `pnpm format` antes de commitear.");
}

// Sanidad: lo escrito se vuelve a leer igual.
for (const [archivo] of salidas) JSON.parse(readFileSync(archivo, "utf8"));

console.log(
  `OK — ${casos.length} casos del motor, ${busquedas.length} búsquedas, ${porPartidas.length} por partidas, ${registros.length} registros (clon en ${commit}).`,
);
