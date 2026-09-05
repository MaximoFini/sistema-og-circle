// VGRP-18 — esquemas Zod compartidos entre los forms de auth (cliente, para
// UX) y las Server Actions de `_actions.ts` (servidor, la frontera de
// confianza real). El form nunca valida "por su cuenta": importa estos
// mismos esquemas para dar feedback inmediato, pero quien de verdad decide
// si los datos entran es siempre `_actions.ts` volviendo a correr
// `.safeParse()` sobre el `FormData` crudo.

import { z } from "zod";

// Estado compartido de las Server Actions de `_actions.ts`, usado con
// `useActionState` en los Client Components de formulario.
//
// Vive ACÁ y no en `_actions.ts` a propósito: ese archivo tiene `"use server"`
// a nivel de módulo, y Next.js valida en build/dev que TODO export de un
// archivo así sea una función async — un `const INITIAL_ACTION_STATE = {}`
// exportado desde ahí revienta con
// `Error: A "use server" file can only export async functions, found object`
// apenas algún Client Component lo importa (bug real, encontrado probando
// /login: https://nextjs.org/docs/messages/invalid-use-server-value). Los
// *tipos* sí pueden vivir en un archivo "use server" (se borran en build),
// pero un valor de runtime no.
export interface ActionState {
  /** Error a nivel formulario (credenciales inválidas, cuenta no creada, etc.). */
  error?: string;
  /**
   * Errores por campo, keyeados por nombre de input. Forma de
   * `flattenError().fieldErrors` de Zod: un array por campo (puede haber más
   * de un mensaje por campo), el form sólo muestra el primero.
   */
  fieldErrors?: Partial<Record<string, string[]>>;
  /**
   * Mensaje de éxito a nivel formulario. Hoy sólo lo usa `solicitarReset`:
   * el form de "olvidaste tu contraseña" no redirige a otra pantalla al
   * terminar (no hay a dónde ir todavía — el usuario sigue esperando el
   * mail), así que necesita mostrar la confirmación en el lugar. Ningún otro
   * action de este archivo lo usa: todos redirigen en el camino feliz.
   */
  mensaje?: string;
}

export const INITIAL_ACTION_STATE: ActionState = {};

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
  // VGRP-34 — checkbox de aceptación de Términos y Privacidad. Un checkbox
  // HTML sin tildar ni siquiera aparece en el FormData (`.get()` da `null`);
  // tildado, manda el string `"true"` (fijado como `value` en
  // `RegistroForm.tsx`). El `z.preprocess` acepta ese string O un boolean
  // directo (útil en tests, o para un caller futuro que no venga de un
  // `<form>`) — la traducción vive acá, en el schema, y no en `_actions.ts`,
  // para no repetirla en cada caller que arme el objeto para `.safeParse()`.
  aceptaTerminos: z.preprocess(
    (v) => v === "true" || v === true,
    z.boolean().refine((v) => v === true, {
      error: "Tenés que aceptar los Términos y la Política de Privacidad.",
    }),
  ),
});

export type RegistroInput = z.infer<typeof registroSchema>;

// VGRP-19 — recuperación de contraseña.

export const solicitarResetSchema = z.object({ email });

export type SolicitarResetInput = z.infer<typeof solicitarResetSchema>;

export const nuevaPasswordSchema = z.object({ password });

export type NuevaPasswordInput = z.infer<typeof nuevaPasswordSchema>;
