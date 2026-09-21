"use server";

// VGRP-33 — editar nombre/teléfono desde el perfil. Mismo criterio que las Server
// Actions de auth (`app/(auth)/_actions.ts`): Zod es la frontera de confianza real,
// se vuelve a validar acá aunque el form ya haya validado en el cliente.
//
// `createSupabaseServerClient()` (RLS, no service role): la policy `profiles_update_own`
// ya limita el UPDATE a la propia fila; el `.eq("id", ...)` de abajo es defensa en
// profundidad explícita. El payload SOLO tiene nombre/telefono — nunca nivel ni rol,
// ni aunque alguien manipulara el FormData: el grant de Postgres
// (`grant update (nombre, telefono, progreso)`, init_plataforma.sql) ni siquiera deja
// escribir esas columnas desde `authenticated`, sea cual sea el código de acá.

import { revalidatePath } from "next/cache";
import { flattenError } from "zod";
import { createSupabaseServerClient, getVerifiedClaims } from "@/lib/auth/server";
import type { ActionState } from "@/lib/forms/action-state";
import { perfilSchema } from "./_schemas";

export async function actualizarPerfil(
  _prevState: ActionState,
  formData: FormData,
): Promise<ActionState> {
  const claims = await getVerifiedClaims();
  const userId = claims?.sub;
  if (typeof userId !== "string" || !userId) {
    return { error: "Tenés que iniciar sesión para editar tu perfil." };
  }

  const parsed = perfilSchema.safeParse({
    nombre: formData.get("nombre"),
    telefono: formData.get("telefono"),
  });

  if (!parsed.success) {
    return { fieldErrors: flattenError(parsed.error).fieldErrors };
  }

  const supabase = await createSupabaseServerClient();
  const { error } = await supabase
    .from("profiles")
    .update({ nombre: parsed.data.nombre, telefono: parsed.data.telefono })
    .eq("id", userId);

  if (error) {
    return { error: "No pudimos guardar tus datos. Probá de nuevo en un momento." };
  }

  revalidatePath("/perfil");
  return { mensaje: "Guardado." };
}
