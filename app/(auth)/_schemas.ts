// VGRP-18 — esquemas Zod compartidos entre los forms de auth (cliente, para
// UX) y las Server Actions de `_actions.ts` (servidor, la frontera de
// confianza real). El form nunca valida "por su cuenta": importa estos
// mismos esquemas para dar feedback inmediato, pero quien de verdad decide
// si los datos entran es siempre `_actions.ts` volviendo a correr
// `.safeParse()` sobre el `FormData` crudo.

import { z } from "zod";

// Sin límite de longitud de password "fuerte" (mayúsculas/símbolos/etc.):
// NIST 800-63B recomienda longitud mínima sobre reglas de composición, que
// en la práctica empujan a los usuarios a patrones predecibles
// ("Password1!"). El límite superior es sólo para no aceptar un payload
// gigante como "contraseña".
const password = z
  .string()
  .min(8, "La contraseña tiene que tener al menos 8 caracteres.")
  .max(200, "La contraseña es demasiado larga.");

const email = z.string().trim().min(1, "Ingresá tu email.").email("Ese email no parece válido.");

export const loginSchema = z.object({
  email,
  password: z.string().min(1, "Ingresá tu contraseña."),
});

export type LoginInput = z.infer<typeof loginSchema>;

export const registroSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresá tu nombre.").max(120, "El nombre es demasiado largo."),
  email,
  // El teléfono se usa para soporte por WhatsApp (ver CLAUDE.md/contexto de
  // negocio): validación laxa a propósito, no se intenta parsear formato
  // internacional acá — cualquier string con dígitos suficientes alcanza,
  // total quien lo lee después es una persona por WhatsApp, no un sistema.
  telefono: z
    .string()
    .trim()
    .min(6, "Ingresá un teléfono de contacto.")
    .max(30, "Ese teléfono es demasiado largo."),
  password,
});

export type RegistroInput = z.infer<typeof registroSchema>;

// VGRP-19 — recuperación de contraseña.

export const solicitarResetSchema = z.object({ email });

export type SolicitarResetInput = z.infer<typeof solicitarResetSchema>;

export const nuevaPasswordSchema = z.object({ password });

export type NuevaPasswordInput = z.infer<typeof nuevaPasswordSchema>;
