"use server";

// VGRP-18 — Server Actions de login y registro.
//
// Zod es la frontera de confianza real (ver `_schemas.ts`): el form del
// cliente valida con el mismo esquema para dar feedback inmediato, pero acá
// se vuelve a correr `.safeParse()` sobre el `FormData` crudo — nunca se
// confía en que el cliente mandó algo válido.

import { redirect } from "next/navigation";
import { flattenError } from "zod";
import { safeRedirectPath } from "@/lib/auth/redirect";
import { createSupabaseServerClient } from "@/lib/auth/server";
import { getFlags } from "@/lib/config";
import { loginSchema, registroSchema } from "./_schemas";

export interface ActionState {
  /** Error a nivel formulario (credenciales inválidas, cuenta no creada, etc.). */
  error?: string;
  /**
   * Errores por campo, keyeados por nombre de input. Forma de
   * `flattenError().fieldErrors` de Zod: un array por campo (puede haber más
   * de un mensaje por campo), el form sólo muestra el primero.
   */
  fieldErrors?: Partial<Record<string, string[]>>;
}

export const INITIAL_ACTION_STATE: ActionState = {};

/**
 * `createSupabaseServerClient()` sirve tal cual acá: estamos en una Server
 * Action, así que a diferencia de un Server Component puro, el `try/catch`
 * de su `setAll` NO se dispara — las cookies de sesión se escriben de
 * verdad (ver el comentario del propio archivo en `lib/auth/server.ts`).
 */

export async function iniciarSesion(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);

  if (error) {
    // Mensaje SIEMPRE genérico, tanto si el email no existe como si la
    // contraseña está mal: acá sí importa la enumeración de emails (ver
    // docs/AUTH.md, sección "Enumeración de emails"). Nunca diferenciar.
    return { error: "Email o contraseña incorrectos." };
  }

  const next = safeRedirectPath(formData.get("next")?.toString());
  redirect(next);
}

export async function registrarse(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const flags = await getFlags();
  if (!flags.registro_habilitado) {
    return { error: "El registro todavía no está habilitado." };
  }

  const parsed = registroSchema.safeParse({
    nombre: formData.get("nombre"),
    email: formData.get("email"),
    telefono: formData.get("telefono"),
    password: formData.get("password"),
  });

  if (!parsed.success) {
    return { fieldErrors: flattenError(parsed.error).fieldErrors };
  }

  const { nombre, email, telefono, password } = parsed.data;

  const supabase = await createSupabaseServerClient();
  const { data, error } = await supabase.auth.signUp({
    email,
    password,
    options: {
      // Metadata del propio evento de signup, no la fila de `profiles`: el
      // trigger `handle_new_user()` (supabase/migrations/…init_plataforma.sql)
      // sólo inserta `id` + `email`, así que `nombre`/`telefono` se persisten
      // aparte más abajo con un UPDATE autenticado.
      data: { nombre, telefono },
    },
  });

  // MITIGACIÓN DE ENUMERACIÓN DE EMAILS, NO SOLUCIÓN COMPLETA (ver
  // docs/AUTH.md, sección "Enumeración de emails"): con "Confirm email"
  // apagado en el dashboard de Supabase (decisión ya tomada), un email
  // duplicado y cualquier otro error de `signUp()` caen en el MISMO mensaje
  // genérico. Aun así, con emails únicos, la latencia/side-effects distintos
  // entre "creó cuenta" y "rechazó por duplicado" siguen siendo, en teoría,
  // observables — de ahí que sea mitigación y no cierre total del canal.
  if (error || !data.user) {
    return {
      error: "No pudimos crear la cuenta con ese email. Si ya tenés cuenta, iniciá sesión.",
    };
  }

  // Señal para el reporte del ticket: si `signUp()` NO devuelve `session`
  // (con "Confirm email" apagado, debería devolverla siempre), es que
  // "Confirm email" sigue prendido en el dashboard de Supabase. En ese caso
  // no hay sesión todavía para hacer el UPDATE de abajo ni para redirigir
  // al dashboard — el flujo real de confirmación es otro ticket.
  if (!data.session) {
    return {
      error: "No pudimos crear la cuenta con ese email. Si ya tenés cuenta, iniciá sesión.",
    };
  }

  // Best-effort: la cuenta ya existe aunque esto falle (RLS + grants por
  // columna en profiles permiten a `authenticated` actualizar nombre y
  // telefono de su propia fila — ver init_plataforma.sql sección 6). No se
  // bloquea el registro por esto; en el peor caso, el usuario queda con
  // nombre/telefono vacíos y soporte se los pide por otro lado.
  await supabase.from("profiles").update({ nombre, telefono }).eq("id", data.user.id);

  redirect("/dashboard");
}
