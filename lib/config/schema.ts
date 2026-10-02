import { z } from "zod";

// Esquema de la configuración mutable en Edge Config (precios, flags y links externos).
// Decisión de proyecto: "precios en configuración, no hardcodeados, nunca".
// No hay descuentos en esta fase: NO agregar claves de early-adopter ni de porcentaje
// promocional a este schema sin una decisión explícita registrada del proyecto.
// Fuente única del enum de fase — VGRP-40 (FlagsForm.tsx) reusa esta misma
// constante en vez de re-tipear los cuatro valores a mano en el form.
export const FASES = ["1", "2", "3", "4"] as const;

export const configSchema = z.object({
  precios: z
    .object({
      principiante: z.number().int().positive(), // ARS
      avanzado: z.number().int().positive(), // ARS
    })
    // Hallazgo de auditoría del panel de admin: sin esto, un PATCH con
    // avanzado < principiante pasaba la validación (cada precio se validaba
    // por separado) y quedaba escrito en Edge Config. El nivel superior
    // desbloquea MÁS infraestructura que el inferior (CONTEXT.md §3) y el
    // upgrade se cobra como la diferencia entre ambos (resumen-ejecutivo.md
    // §2.2) — una diferencia negativa no tiene sentido de negocio.
    .refine((precios) => precios.avanzado >= precios.principiante, {
      message: "El precio de 'avanzado' no puede ser menor al de 'principiante'.",
      path: ["avanzado"],
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
