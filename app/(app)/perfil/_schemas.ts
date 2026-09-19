// VGRP-33 — mismo criterio que app/(auth)/_schemas.ts: el form valida con este mismo
// schema para feedback inmediato, pero quien decide de verdad es el Server Action
// (_actions.ts) volviendo a correr `.safeParse()` sobre el FormData crudo.
//
// Reglas de nombre/teléfono IDÉNTICAS a `registroSchema` (app/(auth)/_schemas.ts) — no
// se reinventan validaciones para el mismo dato en dos lugares del código.
//
// `ActionState`/`INITIAL_ACTION_STATE` viven en `./_action-state.ts` (VGRP-56
// punto 1) — así PerfilForm.tsx no arrastra Zod al bundle sólo para leer un `{}`.

import { z } from "zod";

export const perfilSchema = z.object({
  nombre: z.string().trim().min(1, "Ingresá tu nombre.").max(120, "El nombre es demasiado largo."),
  telefono: z
    .string()
    .trim()
    .min(6, "Ingresá un teléfono de contacto.")
    .max(30, "Ese teléfono es demasiado largo."),
});

export type PerfilInput = z.infer<typeof perfilSchema>;
