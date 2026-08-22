import "server-only";

import { get } from "@vercel/edge-config";
import type { Config } from "./schema";
import { configSchema } from "./schema";

/**
 * Diseño no negociable de este módulo — fail closed en dinero, fail open en cosmético:
 *
 * - `precios`: si falla la lectura de Edge Config o la validación del schema, NO hay
 *   fallback hardcodeado. `getPrecios()` devuelve `{ ok: false, error }` para que el
 *   caller pueda deshabilitar el checkout. Nunca se devuelve un número adivinado.
 * - `flags`: si falla, se usa un default conservador que deja todo apagado
 *   (`checkout_habilitado: false`, `registro_habilitado: false`, `fase: "2"`).
 * - `links`: si falla, se usa un default razonable hardcodeado en este mismo módulo
 *   (un link viejo no cuesta plata).
 *
 * En desarrollo local, sin la env var `EDGE_CONFIG` seteada, la lectura de
 * `@vercel/edge-config` lanza una excepción de forma síncrona. Ese caso se trata
 * exactamente igual que cualquier otra falla de lectura (aplicando las reglas de
 * arriba), nunca se deja escapar como una excepción no controlada.
 */

const DEFAULT_FLAGS: Config["flags"] = {
  checkout_habilitado: false,
  registro_habilitado: false,
  fase: "2",
};

const DEFAULT_LINKS: Config["links"] = {
  calculadora: "https://ogcircle.com/calculadora",
  whatsapp: "https://wa.me/5491100000000",
  traxcargo: "https://traxcargo.com",
};

export type PreciosResult = { ok: true; precios: Config["precios"] } | { ok: false; error: string };

export interface ResolvedConfig {
  precios: PreciosResult;
  flags: Config["flags"];
  links: Config["links"];
}

// Lee una clave de Edge Config. Si EDGE_CONFIG no está seteada, o falla la red/lectura,
// devuelve `undefined` en vez de dejar propagar la excepción — el caller decide qué
// hacer según la regla fail-closed/fail-open que le corresponda a esa clave.
async function readKey(key: string): Promise<unknown> {
  try {
    return await get(key);
  } catch {
    return undefined;
  }
}

export async function getPrecios(): Promise<PreciosResult> {
  const raw = await readKey("precios");
  const parsed = configSchema.shape.precios.safeParse(raw);
  if (!parsed.success) {
    return {
      ok: false,
      error: `precios inválidos o no disponibles en Edge Config: ${parsed.error.message}`,
    };
  }
  return { ok: true, precios: parsed.data };
}

export async function getFlags(): Promise<Config["flags"]> {
  const raw = await readKey("flags");
  const parsed = configSchema.shape.flags.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_FLAGS;
}

export async function getLinks(): Promise<Config["links"]> {
  const raw = await readKey("links");
  const parsed = configSchema.shape.links.safeParse(raw);
  return parsed.success ? parsed.data : DEFAULT_LINKS;
}

// Punto de entrada principal: resuelve las tres secciones de configuración en paralelo,
// aplicando la regla fail-closed/fail-open documentada arriba a cada una.
export async function getConfig(): Promise<ResolvedConfig> {
  const [precios, flags, links] = await Promise.all([getPrecios(), getFlags(), getLinks()]);
  return { precios, flags, links };
}
