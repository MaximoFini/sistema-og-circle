"use client";

// Cliente porque usa `useId()` (hook) para generar el id cuando el caller no
// pasa uno explícito. Los cuatro formularios del Bloque 2 (login, registro,
// recuperar, nueva contraseña) son Client Components de todos modos.
//
// VGRP-56 punto 3 — el render en sí vive en `TextFieldBase` (sin hooks, sin
// "use client"): un Server Component que puede dar un id fijo lo usa directo
// y no necesita este wrapper. Mismo markup en los dos casos.

import { useId } from "react";
import { TextFieldBase, type TextFieldBaseProps } from "./TextFieldBase";

export interface TextFieldProps extends Omit<TextFieldBaseProps, "id"> {
  /** Opcional acá (a diferencia de `TextFieldBase`): sin uno, se genera con `useId()`. */
  id?: string;
}

/**
 * Campo de texto con label, ayuda opcional y estado de error.
 *
 * Accesibilidad (no negociable, ver el brief del Bloque 2):
 * - `<label htmlFor>` siempre asociado al input.
 * - `aria-invalid="true"` cuando hay `error`.
 * - `aria-describedby` apunta a la ayuda y/o al mensaje de error.
 * - El error se anuncia con `role="alert"`.
 * - Foco visible propio (`:focus-visible`), nunca `outline: none` a secas.
 */
export function TextField({ id, ...props }: TextFieldProps) {
  // Si el caller pasa un `id` propio, se usa ese — nunca el generado. Ver el
  // comentario de TextFieldBase sobre por qué el id tiene que ser estable.
  const autoId = useId();
  return <TextFieldBase id={id ?? autoId} {...props} />;
}
