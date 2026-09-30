// VGRP-57 — genera el fixture de paridad de la estrategia de venta corriendo
// el código ORIGINAL de vegroup (src/components/PriceStrategy.jsx), no el port:
//
//   node scripts/cotizador/generar-fixtures-estrategia.mjs <ruta-al-clon-de-vegroup>
//
// Escribe (formateado con Biome) test/fixtures/cotizador/estrategia.json, que
// lib/cotizador/estrategia.test.ts compara con igualdad exacta contra
// lib/cotizador/estrategia.ts.
//
// ── Cómo se corre el original sin tocarlo ────────────────────────────────
// A diferencia de calc.js, la lógica de PriceStrategy vive ADENTRO de un
// .jsx: no se puede importar en Node (JSX) y la mitad son `useMemo` del
// componente. Pero ninguno de los dos pedazos que hacen cuentas tiene JSX:
//
//   1. Módulo: desde `const IVA = 0.21` hasta `function Etiqueta(` (tablas,
//      fijoML, num, ponderar, armar, resolverPrecio, desglosar y, en la
//      sección ESTILO, V/money/pct).
//   2. Cuerpo del componente: desde `const ri = fiscal === 'ri'` hasta el
//      `return (` del JSX (entrada, ranking, sel, canal, mejor, u, lote y
//      avisos, en ese orden).
//
// El script recorta esos dos pedazos del texto del archivo, TAL CUAL, y los
// evalúa con `new Function`: el estado del formulario entra como parámetros
// con los mismos nombres que los `useState`, `useMemo` es `(f) => f()` y los
// setters que usan los avisos (`setMargen`, `setFiscal`) son espías que
// anotan con qué se los llamó. Los valores iniciales salen de evaluar igual
// el bloque de `useState` del original. Si el original cambia de forma y los
// anclajes no aparecen, el script corta con error en vez de adivinar.
//
// NO corre en CI (el clon es privado); el fixture commiteado ES la
// referencia. Mismo criterio que scripts/cotizador/generar-fixtures.mjs.

import { execSync } from "node:child_process";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const COMMIT_ESPERADO = "b550803";
const REPO_ORIGEN = "emilianoverabusiness-blip/vegroup";
const ARCHIVO = "src/components/PriceStrategy.jsx";

const raizRepo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..", "..");
const salida = path.join(raizRepo, "test", "fixtures", "cotizador", "estrategia.json");

const clon = process.argv[2];
if (!clon) {
  console.error(
    "Uso: node scripts/cotizador/generar-fixtures-estrategia.mjs <ruta-al-clon-de-vegroup>",
  );
  process.exit(1);
}
const clonAbs = path.resolve(clon);
const fuentePath = path.join(clonAbs, ...ARCHIVO.split("/"));
if (!existsSync(fuentePath)) {
  console.error(`No encuentro ${fuentePath}. ¿Es la ruta a un clon de ${REPO_ORIGEN}?`);
  process.exit(1);
}

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

// ── Recorte del original ─────────────────────────────────────────────────
const fuente = readFileSync(fuentePath, "utf8").replace(/\r\n/g, "\n");

function entre(desde, hasta, { incluirDesde = true, despuesDe = 0 } = {}) {
  const i = fuente.indexOf(desde, despuesDe);
  if (i < 0) throw new Error(`Anclaje no encontrado en ${ARCHIVO}: ${JSON.stringify(desde)}`);
  const j = fuente.indexOf(hasta, i + desde.length);
  if (j < 0) throw new Error(`Anclaje no encontrado en ${ARCHIVO}: ${JSON.stringify(hasta)}`);
  return { texto: fuente.slice(incluirDesde ? i : i + desde.length, j), fin: j };
}

const modulo = entre("const IVA = 0.21", "function Etiqueta(").texto;
const inicioComponente = fuente.indexOf("export default function PriceStrategy(");
if (inicioComponente < 0) throw new Error("No encuentro el componente PriceStrategy.");
const bloqueEstado = entre("  const [costo, setCosto] = useState(", "  useEffect(", {
  despuesDe: inicioComponente,
}).texto;
const cuerpo = entre("  const ri = fiscal === 'ri'", "\n  return (\n", {
  despuesDe: inicioComponente,
}).texto;

// Nombres de los `useState`, en el orden del original.
const nombresEstado = [...bloqueEstado.matchAll(/const \[(\w+), (\w+)\] = useState\(/g)].map(
  (m) => m[1],
);

const exportsModulo = [
  "IVA",
  "CATEGORIAS_ML",
  "MEDIOS",
  "MIX_TIPICO",
  "PASARELAS",
  "ARANCEL_ML",
  "DIAS_ML",
  "CANALES",
  "fijoML",
  "num",
  "money",
  "pct",
];
const lib = new Function(`${modulo}\nreturn { ${exportsModulo.join(", ")} };`)();

const estadoInicial = new Function(
  `${modulo}\nconst useState = (v) => [v, () => {}];\n${bloqueEstado}\nreturn { ${nombresEstado.join(", ")} };`,
)();

const correrCuerpo = new Function(
  ...nombresEstado,
  "setMargen",
  "setFiscal",
  `${modulo}\nconst useMemo = (f) => f();\n${cuerpo}\nreturn { ri, entrada, ranking, sel, canal, mejor, u, lote, avisos };`,
  // `canal` es CANALES[canalKey] (ya comparado en `constantes`); se devuelve
  // para que el cuerpo corra entero, pero no se guarda (ver evaluarOriginal).
);

// El port no guarda estado de UI (`avanzado`) en el estado de la estrategia:
// no entra en ninguna cuenta. Lo sacamos del estado que se compara.
const { avanzado: _avanzado, ...estadoBase } = estadoInicial;

/** Corre el cuerpo del original y traduce cada `accion.fn` al setter que llamó. */
function evaluarOriginal(estado) {
  const completo = { avanzado: false, ...estado };
  let efecto = null;
  const setMargen = (valor) => {
    efecto = { campo: "margen", valor };
  };
  const setFiscal = (valor) => {
    efecto = { campo: "fiscal", valor };
  };
  const { canal: _canal, ...r } = correrCuerpo(
    ...nombresEstado.map((n) => completo[n]),
    setMargen,
    setFiscal,
  );
  const avisos = r.avisos.map(({ accion, ...resto }) => {
    if (!accion) return resto;
    efecto = null;
    accion.fn();
    if (!efecto) throw new Error(`El aviso ${resto.id} tiene una acción que no llama a un setter.`);
    return { ...resto, accion: { texto: accion.texto, efecto } };
  });
  return { ...r, avisos };
}

// ── Serialización sin pérdida ────────────────────────────────────────────
// JSON pierde NaN/±Infinity (→ null) y `undefined` (→ se omite). El test
// compara el port pasado por el mismo JSON, así que `undefined` y -0 quedan
// simétricos; NaN/Infinity no, porque dos valores distintos darían igual.
function verificarFinito(valor, ruta = "$") {
  if (typeof valor === "number" && !Number.isFinite(valor)) {
    throw new Error(`Valor no finito en ${ruta}: ${valor}`);
  }
  if (valor && typeof valor === "object") {
    for (const [k, v] of Object.entries(valor)) verificarFinito(v, `${ruta}.${k}`);
  }
}
const aJSON = (v) => JSON.parse(JSON.stringify(v));

// ═════════════════════════════════════════════════════════════════════════
// Matriz de casos
// ═════════════════════════════════════════════════════════════════════════

const CLAVES_CANAL = Object.keys(lib.CANALES);
const CLAVES_PASARELA = Object.keys(lib.PASARELAS);
const casos = [];
const ids = new Set();
function agregar(id, cambios) {
  if (ids.has(id)) throw new Error(`id repetido: ${id}`);
  ids.add(id);
  const esperado = aJSON(evaluarOriginal({ ...estadoBase, ...cambios }));
  verificarFinito(esperado, id);
  // Se guarda sólo lo que cambia respecto de `estadoInicial` (el test lo
  // mezcla igual): así el fixture entra en el tope de 1 MB de Biome.
  casos.push({ id, cambios, esperado });
}

// 1) Grilla principal: fiscal × costo × margen, rotando el canal elegido.
const COSTOS = ["0", "5000", "15000", "26000", "1.234.567"];
const MARGENES = ["0", "30", "60", "90"];
let giro = 0;
for (const fiscal of ["mono", "ri"]) {
  for (const costo of COSTOS) {
    for (const margen of MARGENES) {
      const canalKey = CLAVES_CANAL[giro++ % CLAVES_CANAL.length];
      agregar(`grilla/${fiscal}/costo-${costo}/margen-${margen}/${canalKey}`, {
        fiscal,
        costo,
        margen,
        canalKey,
      });
    }
  }
}

// 2) Barrido de costo en ML clásica: cruza los tramos de costo fijo
//    (15.000 / 25.000 / 33.000) para disparar saltos de tramo y oscilación.
for (let c = 2000; c <= 24000; c += 1000) {
  agregar(`barrido/ml_clasica/mono/costo-${c}`, { costo: String(c), canalKey: "ml_clasica" });
}
for (let c = 2000; c <= 24000; c += 4000) {
  agregar(`barrido/ml_premium/ri/costo-${c}`, {
    costo: String(c),
    canalKey: "ml_premium",
    fiscal: "ri",
    margen: "25",
  });
}

// 3) Categorías de ML (incluida Supermercado: sin fijo y con extra) y una
//    que no existe (cae a "Otras categorías" en la comisión).
// (Las comisiones de TODAS las categorías ya se comparan en `constantes`.)
const CATEGORIAS = [
  "Hogar, muebles y jardín",
  "Alimentos y bebidas",
  "Belleza y cuidado personal",
  "Electrónica, audio y video",
  "Herramientas",
  "Juegos y juguetes",
  "Supermercado",
  "Categoría que no existe",
];
for (const categoria of CATEGORIAS) {
  agregar(`categoria/${categoria}`, { categoria, costo: "9000", canalKey: "ml_premium" });
}

// 4) Cada pasarela, alternando entre dos canales de tienda propia.
CLAVES_PASARELA.forEach((pasarelaKey, i) => {
  const canalKey = i % 2 ? "propia" : "tiendanube";
  agregar(`pasarela/${pasarelaKey}/${canalKey}`, { pasarelaKey, canalKey });
});

// 5) Un plan distinto al de por defecto en cada tienda (el último de la
//    tabla: el de menor comisión; los valores de todos van en `constantes`).
for (const canalKey of CLAVES_CANAL) {
  const canal = lib.CANALES[canalKey];
  if (canal.ml) continue;
  const plan = Object.keys(canal.planes).at(-1);
  agregar(`plan/${canalKey}/${plan}`, {
    canalKey,
    planes: { ...estadoBase.planes, [canalKey]: plan },
  });
}
agregar("plan/inexistente", {
  canalKey: "shopify",
  planes: { ...estadoBase.planes, shopify: "Plan que no existe" },
});

// 6) Comisión manual (sólo pisa la del canal elegido).
for (const comisionManual of ["", "  ", "11", "7,5", "abc"]) {
  for (const canalKey of ["ml_clasica", "empretienda"]) {
    agregar(`comision-manual/${JSON.stringify(comisionManual)}/${canalKey}`, {
      comisionManual,
      canalKey,
    });
  }
}

// 7) Mix de pagos.
const mixes = {
  "todo-cero": { cred1: "0", cred3: "0", cred6: "0", debito: "0", cuenta: "0", transf: "0" },
  "solo-transferencia": {
    cred1: "0",
    cred3: "0",
    cred6: "0",
    debito: "0",
    cuenta: "0",
    transf: "100",
  },
  "cuotas-pesadas": {
    cred1: "10",
    cred3: "30",
    cred6: "60",
    debito: "0",
    cuenta: "0",
    transf: "0",
  },
  "no-suma-100": { cred1: "5", cred3: "5", cred6: "5", debito: "5", cuenta: "5", transf: "5" },
  "con-texto": { cred1: "abc", cred3: "20,5", cred6: "", debito: "15", cuenta: "10", transf: "5" },
};
Object.entries(mixes).forEach(([nombre, mix], i) => {
  const canalKey = i % 2 ? "tiendanube" : "ml_clasica";
  agregar(`mix/${nombre}/${canalKey}`, { mix, canalKey, margen: "15" });
});

// 8) Situación fiscal, IIBB, retenciones, capital, envío y packaging.
const fiscales = {
  "ri-sin-iva-recuperable": { fiscal: "ri", ivaRecuperable: false },
  "ri-retenciones-no-recuperables": { fiscal: "ri", retencionesRecuperables: false },
  "mono-retenciones-no-recuperables": { retencionesRecuperables: false },
  "sin-iibb": { inscriptoIIBB: false },
  "sin-iibb-ri": { inscriptoIIBB: false, fiscal: "ri" },
  "iibb-5": { iibb: "5" },
  "sirtac-y-ret-altas": { fiscal: "ri", sirtac: "3", retIVA: "2,5", retGan: "6" },
  "capital-0": { tasaCapital: "0" },
  "capital-8": { tasaCapital: "8", pasarelaKey: "mp_30", canalKey: "shopify" },
  "envio-y-packaging": { envio: "4500", otros: "1.200" },
  "envio-y-packaging-ri": { envio: "4500", otros: "1200", fiscal: "ri" },
};
for (const [nombre, cambios] of Object.entries(fiscales)) {
  agregar(`fiscal/${nombre}`, cambios);
}

// 9) Unidades del lote.
for (const unidades of ["0", "1", "2500,7", "abc", "-3", "1.000"]) {
  agregar(`unidades/${JSON.stringify(unidades)}`, { unidades });
}

// 10) Casos para avisos puntuales.
agregar("avisos/rojos-varios", {
  margen: "5",
  canalKey: "tiendanube",
  pasarelaKey: "pagonube",
  mix: { cred1: "0", cred3: "40", cred6: "60", debito: "0", cuenta: "0", transf: "0" },
});
agregar("avisos/rojo-uno", {
  margen: "8",
  canalKey: "shopify",
  pasarelaKey: "mp_inm",
  mix: { cred1: "90", cred3: "0", cred6: "10", debito: "0", cuenta: "0", transf: "0" },
});
agregar("avisos/ri-margen-cero", { fiscal: "ri", margen: "0" });
agregar("avisos/elegido-imposible", { margen: "70", canalKey: "ml_premium" });

// Entradas de las funciones sueltas.
const entradasNum = [
  "",
  "  ",
  "0",
  "15000",
  "15.000",
  "1.234.567",
  "1.234,56",
  "1,5",
  "3.5",
  "12.34",
  "-1.234",
  "abc",
  " 2 500 ",
  "1.2.3",
  "1,2,3",
  7,
  -3.5,
  Number.NaN,
];
const numeros = entradasNum.map((s) => ({
  s: typeof s === "number" && Number.isNaN(s) ? "NaN" : s,
  v: lib.num(s),
}));
const fijos = [];
for (const categoria of ["Hogar, muebles y jardín", "Supermercado", "Categoría que no existe"]) {
  for (const precio of [-1, 0, 1, 14999.99, 15000, 24999.99, 25000, 32999.99, 33000, 1e6]) {
    fijos.push({ precio, categoria, v: lib.fijoML(precio, categoria) });
  }
}
const formatos = [0, 0.4, 0.5, -0.5, -0.6, 1234.5, -98765.4, 1e7, null].map((v) => ({
  v,
  money: lib.money(v),
  pct: lib.pct(v),
  pct0: lib.pct(v, 0),
  pct2: lib.pct(v, 2),
}));

const fixture = {
  _comentario:
    "GENERADO por scripts/cotizador/generar-fixtures-estrategia.mjs con PriceStrategy.jsx ORIGINAL. No editar a mano.",
  origen: { repo: REPO_ORIGEN, commit, archivo: ARCHIVO },
  constantes: {
    IVA: lib.IVA,
    CATEGORIAS_ML: lib.CATEGORIAS_ML,
    MEDIOS: lib.MEDIOS,
    MIX_TIPICO: lib.MIX_TIPICO,
    PASARELAS: lib.PASARELAS,
    ARANCEL_ML: lib.ARANCEL_ML,
    DIAS_ML: lib.DIAS_ML,
    CANALES: lib.CANALES,
  },
  estadoInicial: estadoBase,
  numeros,
  fijos,
  formatos,
  casos,
};

writeFileSync(salida, `${JSON.stringify(fixture, null, 2)}\n`);
try {
  // Ruta relativa con "/": en Windows, JSON.stringify duplica las "\" de la
  // absoluta y Biome no encuentra el archivo.
  const relativa = path.relative(raizRepo, salida).split(path.sep).join("/");
  execSync(`pnpm biome format --write ${relativa}`, {
    cwd: raizRepo,
    stdio: "inherit",
  });
} catch {
  console.warn("[aviso] No se pudo correr Biome; corré `pnpm format` antes de commitear.");
}
JSON.parse(readFileSync(salida, "utf8"));

const conOscila = casos.filter(
  (c) => c.esperado.sel.oscila || c.esperado.ranking.some((f) => f.oscila),
).length;
const idsAvisos = new Set(casos.flatMap((c) => c.esperado.avisos.map((a) => a.id)));
console.log(
  `OK — ${casos.length} casos (${conOscila} con oscilación de tramo; avisos cubiertos: ${[...idsAvisos].sort().join(", ")}) (clon en ${commit}).`,
);
