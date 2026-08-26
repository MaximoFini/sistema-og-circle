// VGRP-43 — guarda de seguridad antes de cualquier test que toque una base
// de datos real (integración, seed, E2E, limpieza).
//
// Decisión de entorno (VGRP-43, actualizada): mientras el proyecto no
// facture, los tests corren contra el MISMO proyecto Supabase que usa la
// app (`og-circle`) — no se paga una branch ni un proyecto separado sin
// ingresos. Ese es hoy un riesgo aceptado a propósito (ver docs/TESTING.md),
// no algo que este guard pueda evitar: si lo hiciera, bloquearía a la app
// misma. Lo que SÍ hace este guard es dejar la protección lista para
// cuando exista un proyecto de producción de verdad, separado de este:
// basta con completar `PRODUCTION_SUPABASE_PROJECT_REF` y, a partir de ahí,
// apuntar los tests a ese ref (o cualquier connection string que lo
// contenga) aborta la corrida antes de tocar nada.
//
// Lógica pura, sin I/O: recibe una URL y el ref de referencia, y decide.
// Vive separada del cliente de Supabase (`db-client.ts`) para poder
// testearla sin red ni credenciales — ver production-guard.test.ts.

export class ProductionDatabaseGuardError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "ProductionDatabaseGuardError";
  }
}

function extractProjectRef(url: string): string | null {
  // URLs de Supabase: https://<ref>.supabase.co (hosted) o
  // postgres://...@<ref>.supabase.co:5432/... (o vía pooler, con el ref en
  // el usuario: postgres.<ref>). Cubrimos ambas formas porque los tests
  // pueden recibir una URL de API o una connection string de Postgres.
  const hostMatch = url.match(/([a-z0-9]{20})\.supabase\.co/i);
  if (hostMatch) return hostMatch[1].toLowerCase();

  const poolerUserMatch = url.match(/postgres\.([a-z0-9]{20})/i);
  if (poolerUserMatch) return poolerUserMatch[1].toLowerCase();

  return null;
}

// Módulo-level, no por llamada: `assertNotProductionDatabase` se llama una
// vez por cliente creado (varias veces por corrida de test), y este aviso
// solo tiene que aparecer una vez por proceso, no ensuciar el log entero.
let warnedNoProductionRefConfigured = false;

/**
 * Lanza `ProductionDatabaseGuardError` si `connectionStringOrUrl` apunta al
 * ref configurado en `PRODUCTION_SUPABASE_PROJECT_REF`, o si la URL viene
 * vacía. Cualquier helper que cree un cliente contra una base real
 * (`db-client.ts`, el seed, la limpieza, el global setup/teardown de
 * Playwright/Vitest) llama a esto ANTES de crear el cliente.
 *
 * Si `PRODUCTION_SUPABASE_PROJECT_REF` todavía no está configurado (hoy: no
 * existe un proyecto de producción separado), esta función no compara nada
 * y no lanza por eso — sería imposible distinguir "proyecto de producción"
 * de "el único proyecto que existe, que también usan los tests". El check
 * de URL vacía sí corre siempre: no depende de que exista producción.
 *
 * En ese caso, además, avisa por consola (una vez por proceso): que la
 * función no lance nada acá NO significa "está protegido" — significa "no
 * hay nada configurado contra qué comparar". Sin este aviso es fácil asumir
 * que `assertNotProductionDatabase` ya cubre el caso, cuando en esta fase no
 * cubre nada más que la URL vacía.
 */
export function assertNotProductionDatabase(connectionStringOrUrl: string | undefined): void {
  if (!connectionStringOrUrl || connectionStringOrUrl.trim() === "") {
    throw new ProductionDatabaseGuardError(
      "Falta la connection string / URL de Supabase para tests. No se puede " +
        "correr un test que toca base de datos sin saber contra qué corre.",
    );
  }

  const productionRef = process.env.PRODUCTION_SUPABASE_PROJECT_REF;
  if (!productionRef || productionRef.trim() === "") {
    if (!warnedNoProductionRefConfigured) {
      warnedNoProductionRefConfigured = true;
      console.warn(
        "[production-guard] PRODUCTION_SUPABASE_PROJECT_REF no está configurada: " +
          "esta corrida NO tiene protección real contra apuntar a un proyecto de " +
          "producción (hoy no existe uno separado — ver docs/TESTING.md).",
      );
    }
    return;
  }

  const ref = extractProjectRef(connectionStringOrUrl);
  if (ref === productionRef.toLowerCase()) {
    throw new ProductionDatabaseGuardError(
      `La URL de test apunta al proyecto de PRODUCCIÓN (ref ${productionRef}). ` +
        "Abortando antes de tocar nada. Ver docs/TESTING.md.",
    );
  }
}
