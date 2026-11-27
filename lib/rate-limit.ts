// Límite de uso en memoria (ventana deslizante). Auditoría de seguridad nov 2026.
//
// Alcance honesto: el estado vive en la memoria de CADA instancia serverless, así que
// no es un tope global exacto — frena scripts en loop y abuso casual, no un ataque
// distribuido. Un límite global (Upstash Redis) queda pendiente (ver página de Plane
// "Vulnerabilidades de seguridad"). Supabase Auth además aplica sus propios límites.

import "server-only";
import { headers } from "next/headers";

const usos = new Map<string, number[]>();
const MAX_CLAVES = 5000;

export interface OpcionesLimite {
  max: number;
  ventanaMs: number;
}

// Los E2E hacen decenas de logins desde una sola IP (la del runner) y chocarían con el
// tope. playwright.config.ts lo apaga SOLO en el servidor de test; nunca en producción
// (en cualquier entorno de Vercel —production o preview— se ignora aunque alguien lo
// setee por error).
function limiteDesactivado(): boolean {
  return process.env.RATE_LIMIT_DESACTIVADO === "1" && !process.env.VERCEL;
}

/**
 * Registra un uso de `clave` y devuelve `true` si ya superó `max` dentro de la ventana
 * (en ese caso NO suma el intento, así el bloqueo termina solo al vencer la ventana).
 */
export function excedeLimite(
  clave: string,
  { max, ventanaMs }: OpcionesLimite,
  ahora = Date.now(),
): boolean {
  if (limiteDesactivado()) return false;
  const recientes = (usos.get(clave) ?? []).filter((t) => ahora - t < ventanaMs);
  if (recientes.length >= max) {
    usos.set(clave, recientes);
    return true;
  }
  recientes.push(ahora);
  usos.set(clave, recientes);

  if (usos.size > MAX_CLAVES) {
    for (const [k, v] of usos) {
      if (v.every((t) => ahora - t >= ventanaMs)) usos.delete(k);
    }
  }
  return false;
}

/**
 * IP del cliente según el proxy de Vercel (`x-forwarded-for`, primer valor). Fuera de un
 * request (tests) devuelve "desconocida" en vez de lanzar.
 */
export async function ipDelCliente(): Promise<string> {
  try {
    const h = await headers();
    const reenviada = h.get("x-forwarded-for")?.split(",")[0]?.trim();
    return reenviada || h.get("x-real-ip") || "desconocida";
  } catch {
    return "desconocida";
  }
}

/** Solo para tests. */
export function reiniciarLimites(): void {
  usos.clear();
}
