// VGRP-43 — Next.js carga `.env.local` solo para sí mismo (`next dev`/`next
// build`); nada de eso aplica a `vitest`, `playwright` ni a los scripts que
// corren con `tsx` (seed, limpieza). Sin este loader, SUPABASE_SERVICE_ROLE_KEY
// nunca llegaría a `process.env` en esos procesos y todo fallaría con "falta
// la variable de entorno" aunque esté bien puesta en `.env.local`.
//
// Deliberadamente sin la librería `dotenv`: es un parser mínimo para no sumar
// una dependencia solo para esto. Efecto secundario al importarse — importar
// este módulo UNA VEZ, lo antes posible (ver db-client.ts, global-teardown.ts).

import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function loadEnvFile(path: string): void {
  let content: string;
  try {
    content = readFileSync(path, "utf-8");
  } catch {
    return; // el archivo no existe — normal en CI, que setea process.env directo.
  }

  for (const line of content.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;

    const eq = trimmed.indexOf("=");
    if (eq === -1) continue;

    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    // Nunca pisar una variable ya seteada (los secrets reales de CI, por
    // ejemplo, tienen que ganarle siempre a lo que diga un archivo local).
    if (process.env[key] === undefined) {
      process.env[key] = value;
    }
  }
}

// `.env` primero, `.env.local` después (mismo orden de precedencia que usa
// Next.js: lo más específico gana, pero nunca pisa lo que ya esté en el
// entorno real del proceso).
loadEnvFile(resolve(process.cwd(), ".env"));
loadEnvFile(resolve(process.cwd(), ".env.local"));
