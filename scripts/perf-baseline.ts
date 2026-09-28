/**
 * Medición de rendimiento — línea de base del Bloque 10 (VGRP-54/55/56).
 *
 * El guardarraíl del bloque dice: "se mide antes y después, con el mismo
 * método". Este script ES ese método. No cambia nada del sistema: levanta un
 * navegador real contra un build de producción ya corriendo, navega las
 * pantallas del camino caliente y anota números.
 *
 * Qué mide, y por qué cada uno está acá:
 *
 *  - ttfb / dcl / load — el costo de servir la pantalla (VGRP-54).
 *  - reqsPostLoad — requests que arrancan DESPUÉS del evento `load`, o sea
 *    el fetch-post-hidratación. Es el hallazgo más caro de VGRP-54: hoy
 *    /dashboard/[variante] dispara 4 (agentes, profesionales, servicios,
 *    perfil). Objetivo del ticket: 0.
 *  - hidratadoEn — cuándo termina el último de esos requests. Es la
 *    velocidad percibida real: hasta ahí la pantalla dice "Cargando…".
 *  - jsKb / totalKb — peso del cliente (VGRP-56).
 *
 * Uso:
 *   1. pnpm build && npx next start -p 3210
 *   2. npx tsx scripts/perf-baseline.ts > perf-<antes|despues>.json
 *
 * Variables: PERF_BASE_URL (default http://localhost:3210), PERF_REPS
 * (default 5, se reporta la mediana).
 */

import { type Browser, type CDPSession, chromium, type Page } from "@playwright/test";
import { SEED_USERS } from "../test/helpers/seed-users";

const BASE_URL = process.env.PERF_BASE_URL ?? "http://localhost:3210";
const REPS = Number(process.env.PERF_REPS ?? 5);

type Sesion = "anonimo" | "ninguno" | "principiante" | "admin";

interface Objetivo {
  ruta: string;
  como: Sesion;
}

// El camino caliente, en el orden en que lo recorre un usuario real.
const OBJETIVOS: readonly Objetivo[] = [
  { ruta: "/login", como: "anonimo" },
  { ruta: "/registro", como: "anonimo" },
  { ruta: "/recuperar", como: "anonimo" },
  { ruta: "/terminos", como: "anonimo" },
  // El usuario que todavía no pagó: según el comentario de dashboard/page.tsx
  // es el estado más común, y hoy es el único render dinámico del camino.
  { ruta: "/dashboard", como: "ninguno" },
  { ruta: "/comprar", como: "ninguno" },
  { ruta: "/dashboard", como: "principiante" },
  { ruta: "/dashboard/principiante", como: "principiante" },
  { ruta: "/perfil", como: "principiante" },
  { ruta: "/admin", como: "admin" },
  { ruta: "/admin/usuarios", como: "admin" },
  { ruta: "/admin/pagos", como: "admin" },
  { ruta: "/admin/auditoria", como: "admin" },
  { ruta: "/admin/config", como: "admin" },
];

interface MedicionCruda {
  ttfb: number;
  dcl: number;
  load: number;
  hidratadoEn: number;
  reqsPostLoad: number;
  reqsApiPostLoad: number;
  urlsPostLoad: string[];
  jsKb: number;
  totalKb: number;
}

function mediana(xs: number[]): number {
  const s = [...xs].sort((a, b) => a - b);
  const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}

function usuarioDe(sesion: Exclude<Sesion, "anonimo">) {
  const u =
    sesion === "admin"
      ? SEED_USERS.find((x) => x.rol === "admin")
      : SEED_USERS.find((x) => x.nivel === sesion && x.rol === "user");
  if (!u) throw new Error(`No hay usuario seed para "${sesion}". Corré: pnpm db:seed:test`);
  return u;
}

async function login(page: Page, sesion: Exclude<Sesion, "anonimo">) {
  const u = usuarioDe(sesion);
  await page.goto(`${BASE_URL}/login`);
  await page.getByLabel("Email").fill(u.email);
  await page.getByLabel("Contraseña").fill(u.password);
  await page.getByRole("button", { name: "Iniciar sesión" }).click();
  await page.waitForURL("**/dashboard**", { timeout: 30_000 });
}

const MEDICION_EN_EL_BROWSER = `(() => {
  var nav = performance.getEntriesByType("navigation")[0];
  var recursos = performance.getEntriesByType("resource");
  var finLoad = nav.loadEventEnd;
  var postLoad = recursos.filter(function (r) {
    return r.startTime > finLoad && (r.initiatorType === "fetch" || r.initiatorType === "xmlhttprequest");
  });
  var jsBytes = 0, totalBytes = nav.transferSize || 0;
  for (var i = 0; i < recursos.length; i++) {
    var r = recursos[i];
    totalBytes += r.transferSize || 0;
    if (r.name.indexOf(".js") !== -1) jsBytes += r.transferSize || 0;
  }
  var kb = function (b) { return Math.round((b / 1024) * 10) / 10; };
  var finPostLoad = finLoad;
  for (var j = 0; j < postLoad.length; j++) {
    if (postLoad[j].responseEnd > finPostLoad) finPostLoad = postLoad[j].responseEnd;
  }
  return {
    ttfb: Math.round(nav.responseStart - nav.requestStart),
    dcl: Math.round(nav.domContentLoadedEventEnd),
    load: Math.round(finLoad),
    hidratadoEn: Math.round(finPostLoad),
    reqsPostLoad: postLoad.length,
    reqsApiPostLoad: postLoad.filter(function (r) { return new URL(r.name).pathname.indexOf("/api/") === 0; }).length,
    urlsPostLoad: postLoad.map(function (r) { return new URL(r.name).pathname; }),
    jsKb: kb(jsBytes),
    totalKb: kb(totalBytes)
  };
})()`;

/**
 * Una navegación medida. `load` es el corte: todo request que ARRANCA después
 * del evento load es trabajo que el usuario paga con la pantalla ya pintada
 * (y, en las grillas de Inicio, con un "Cargando…" a la vista).
 */
async function medirUna(
  page: Page,
  cdp: CDPSession,
  ruta: string,
  cacheFria = false,
): Promise<MedicionCruda> {
  // La primera corrida va con caché deshabilitada: `jsKb`/`totalKb` sólo
  // significan algo para un visitante nuevo, que es el caso que importa.
  // `setCacheDisabled` solo no alcanza — Chrome sirve igual desde la caché en
  // memoria del renderer y los kB salen en cero.
  await cdp.send("Network.setCacheDisabled", { cacheDisabled: cacheFria });
  if (cacheFria) await cdp.send("Network.clearBrowserCache");
  await page.goto(`${BASE_URL}${ruta}`, { waitUntil: "load" });
  // Margen para que los useEffect(fetch) arranquen y terminen.
  await page.waitForTimeout(2500);

  // El cuerpo va como string a propósito: `tsx`/esbuild compila con
  // `keepNames`, que inyecta un helper `__name` que no existe dentro del
  // navegador y rompe cualquier función que se serialice a `page.evaluate`.
  return page.evaluate(MEDICION_EN_EL_BROWSER) as Promise<MedicionCruda>;
}

async function main() {
  const browser: Browser = await chromium.launch();
  const resultados: Record<string, unknown>[] = [];

  for (const sesion of ["anonimo", "ninguno", "principiante", "admin"] as const) {
    const objetivos = OBJETIVOS.filter((o) => o.como === sesion);
    if (!objetivos.length) continue;

    const ctx = await browser.newContext();
    const page = await ctx.newPage();
    // Una sola sesión CDP por página, viva durante todas las mediciones de
    // esa sesión: abrir una por navegación se desconecta a destiempo.
    const cdp = await ctx.newCDPSession(page);
    if (sesion !== "anonimo") await login(page, sesion);

    for (const { ruta } of objetivos) {
      const corridas: MedicionCruda[] = [];
      for (let i = 0; i < REPS; i++) {
        // Contexto nuevo por corrida no: se reusa la sesión, pero sí se
        // limpia el timing buffer navegando de cero cada vez.
        corridas.push(await medirUna(page, cdp, ruta, i === 0));
      }
      resultados.push({
        ruta,
        sesion,
        reps: REPS,
        ttfbMs: mediana(corridas.map((c) => c.ttfb)),
        dclMs: mediana(corridas.map((c) => c.dcl)),
        loadMs: mediana(corridas.map((c) => c.load)),
        hidratadoEnMs: mediana(corridas.map((c) => c.hidratadoEn)),
        reqsPostLoad: mediana(corridas.map((c) => c.reqsPostLoad)),
        reqsApiPostLoad: mediana(corridas.map((c) => c.reqsApiPostLoad)),
        urlsPostLoad: [...new Set(corridas.flatMap((c) => c.urlsPostLoad))].sort(),
        jsKbCacheFria: corridas[0].jsKb,
        totalKbCacheFria: corridas[0].totalKb,
      });
      process.stderr.write(`  medido ${sesion} ${ruta}\n`);
    }
    await ctx.close();
  }

  await browser.close();
  process.stdout.write(
    `${JSON.stringify({ baseUrl: BASE_URL, fecha: new Date().toISOString(), reps: REPS, resultados }, null, 2)}\n`,
  );
}

main().catch((e) => {
  process.stderr.write(`${e}\n`);
  process.exit(1);
});
