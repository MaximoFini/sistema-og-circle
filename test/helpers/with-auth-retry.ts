// VGRP-44/45 — reintento con backoff ante el rate limit NATIVO de Supabase
// Auth (`429 over_request_rate_limit`).
//
// Sin una base de test separada (mismo proyecto real para todo, ver
// docs/TESTING.md), una suite con varios archivos que loguean/crean/borran
// usuarios en secuencia puede superar igual el límite del proyecto, incluso
// con `fileParallelism: false` en vitest.config.ts (eso evita que los
// ARCHIVOS corran en paralelo, pero el límite de Supabase es de volumen
// total en una ventana de tiempo, no sólo de concurrencia — se descubrió
// corriendo `pnpm test` completo por primera vez con todos los bloques de
// VGRP-44/45 juntos). Reintentar con backoff es la respuesta correcta acá:
// es exactamente el tipo de error transitorio para el que existen los
// reintentos, no un bug de ningún test puntual.

interface AuthErrorLike {
  status?: number;
  code?: string;
  message: string;
}

// `R` queda tal cual (no se descompone en `{data, error}` propio) a
// propósito: los métodos de `supabase.auth`/`supabase.auth.admin` devuelven
// discriminated unions donde la FORMA de `data` cambia según haya error o no
// (ej. `{ user: User }` en éxito vs. `{ user: null }` en error) — intentar
// unificar eso en un `{ data: T }` genérico rompe ese discriminated union y
// el caller pierde el narrowing normal de `if (error) ...`. Sólo se exige
// que `R` tenga un campo `error` para poder inspeccionarlo.
interface HasAuthError {
  error: AuthErrorLike | null;
}

const MAX_INTENTOS = 6;
const ESPERA_BASE_MS = 1500;

function esRateLimit(error: AuthErrorLike | null | undefined): boolean {
  if (!error) return false;
  return error.status === 429 || error.code === "over_request_rate_limit";
}

function esperar(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Envuelve cualquier llamada de `supabase.auth`/`supabase.auth.admin` que
 * devuelva algo con un campo `error` (crear/loguear/borrar/actualizar
 * usuario, listar usuarios) y reintenta con backoff exponencial SÓLO si el
 * error es el rate limit nativo de Supabase — cualquier otro error se
 * devuelve tal cual, sin reintentar, porque un error real no se arregla
 * reintentando y ocultarlo detrás de reintentos sería peor que dejarlo
 * fallar.
 */
export async function withAuthRetry<R extends HasAuthError>(fn: () => Promise<R>): Promise<R> {
  let resultado = await fn();
  for (let intento = 0; esRateLimit(resultado.error) && intento < MAX_INTENTOS - 1; intento++) {
    const espera = ESPERA_BASE_MS * 2 ** intento;
    console.warn(
      `[withAuthRetry] rate limit de Supabase Auth (intento ${intento + 1}/${MAX_INTENTOS - 1}), ` +
        `esperando ${espera}ms antes de reintentar.`,
    );
    await esperar(espera);
    resultado = await fn();
  }
  return resultado;
}
