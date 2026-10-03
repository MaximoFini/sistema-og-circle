// =============================================================================
// VGRP-62 / Bloque 13 — Validación de las cuentas de cobro (a dónde transfiere
// el usuario). Módulo puro: sin I/O ni `server-only`, así lo usan por igual el
// servidor (fuente de verdad), los tests y, si hace falta, un formulario de
// cliente para dar feedback inmediato.
//
// ENTRADA TOLERANTE, SALIDA CANÓNICA: un admin va a pegar el CUIT como
// "20-12345678-6" o el CBU con espacios, copiados de un home banking. Se aceptan
// separadores (espacio, punto, guion) y se guarda siempre la forma canónica
// (sólo dígitos), para que lo guardado sea comparable.
// =============================================================================

import { z } from "zod";

const SEPARADORES = /[\s.-]/g;

function soloDigitos(valor: string): string {
  return valor.replace(SEPARADORES, "");
}

// Pesos de la AFIP/ARCA para el dígito verificador del CUIT/CUIL, sobre los 10
// primeros dígitos.
const PESOS_CUIT = [5, 4, 3, 2, 7, 6, 5, 4, 3, 2] as const;

/**
 * Valida un CUIT/CUIL de 11 dígitos (ya sin separadores) y su dígito
 * verificador. El resto 10 no existe como dígito: la AFIP reasigna esos
 * números con otro prefijo, así que un CUIT real nunca lo produce y se rechaza.
 */
export function cuitValido(digitos: string): boolean {
  if (!/^\d{11}$/.test(digitos)) return false;

  const suma = PESOS_CUIT.reduce((acc, peso, i) => acc + peso * Number(digitos[i]), 0);
  const resto = suma % 11;
  const esperado = resto === 0 ? 0 : 11 - resto;

  // Con resto 1 el esperado da 10, que no es un dígito: nunca coincide.
  return esperado === Number(digitos[10]);
}

// -----------------------------------------------------------------------------
// Schemas
// -----------------------------------------------------------------------------

const ALIAS_REGEX = /^[a-zA-Z0-9.-]{6,20}$/;

const textoObligatorio = (mensaje: string) => z.string().trim().min(1, mensaje);

export const cuentaCobroSchema = z.object({
  titular: textoObligatorio("Ingresá el titular de la cuenta."),
  cuit: z
    .string()
    .transform(soloDigitos)
    .refine(
      cuitValido,
      "El CUIT no es válido: tiene que tener 11 dígitos y un verificador correcto.",
    ),
  banco: textoObligatorio("Ingresá el banco."),
  cbu_cvu: z
    .string()
    .transform(soloDigitos)
    .refine((v) => /^\d{22}$/.test(v), "El CBU/CVU tiene que tener 22 dígitos."),
  alias: z
    .string()
    .trim()
    .regex(
      ALIAS_REGEX,
      "El alias tiene que tener entre 6 y 20 caracteres: letras, números, punto o guion.",
    ),
  // Vacío = sin notas. El `transform` va ANTES de `nullable().optional()` a
  // propósito: un PATCH que no manda `notas` (undefined) no corre el transform,
  // así que no las pisa con `null`.
  notas: z
    .string()
    .trim()
    .transform((v) => (v === "" ? null : v))
    .nullable()
    .optional(),
});

/**
 * PATCH: cualquier subconjunto de campos, pero al menos uno. `activa` no está
 * en el schema a propósito (Zod descarta las claves que no conoce): activar es
 * una acción aparte (`activar_cuenta_cobro`), que mantiene "una sola activa".
 */
export const cuentaCobroPatchSchema = cuentaCobroSchema
  .partial()
  .refine((valores) => Object.keys(valores).length > 0, "No hay ningún cambio para guardar.");
