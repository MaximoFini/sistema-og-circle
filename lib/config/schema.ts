import { z } from "zod";

// Esquema de la configuración mutable en Edge Config (precios, flags y links externos).
// Decisión de proyecto: "precios en configuración, no hardcodeados, nunca".
// No hay descuentos en esta fase: NO agregar claves de early-adopter ni de porcentaje
// promocional a este schema sin una decisión explícita registrada del proyecto.
// Fuente única del enum de fase — VGRP-40 (FlagsForm.tsx) reusa esta misma
// constante en vez de re-tipear los cuatro valores a mano en el form.
export const FASES = ["1", "2", "3", "4"] as const;

export const configSchema = z.object({
  precios: z.object({
    principiante: z.number().int().positive(), // ARS
    avanzado: z.number().int().positive(), // ARS
  }),
  flags: z.object({
    checkout_habilitado: z.boolean(),
    registro_habilitado: z.boolean(),
    fase: z.enum(FASES),
  }),
  links: z.object({
    calculadora: z.string().url(),
    whatsapp: z.string().url(),
    traxcargo: z.string().url(),
  }),
});

export type Config = z.infer<typeof configSchema>;
