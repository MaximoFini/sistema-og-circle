"use client";

// VGRP-33 — mismo patrón que RegistroForm (app/(auth)/registro/RegistroForm.tsx):
// useActionState + Server Action con Zod. Pre-cargado con los valores actuales
// (defaultValue) — el usuario edita lo que ya tiene, no arranca de un form vacío.
// Vive dentro de DatosModal.tsx: el email (no editable) se muestra ahí, afuera
// de este form.

import { useActionState, useEffect } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import { INITIAL_ACTION_STATE } from "@/lib/forms/action-state";
import { actualizarPerfil } from "./_actions";
import styles from "./perfil.module.css";

export function PerfilForm({
  nombreInicial,
  telefonoInicial,
  onGuardado,
}: {
  nombreInicial: string;
  telefonoInicial: string;
  /** Se llama tras un guardado exitoso — DatosModal la usa para cerrarse sola. */
  onGuardado?: () => void;
}) {
  const [state, formAction, pending] = useActionState(actualizarPerfil, INITIAL_ACTION_STATE);

  // Deja ver el "Guardado." un instante antes de cerrar — un cierre
  // instantáneo no da tiempo a confirmar que el guardado funcionó.
  useEffect(() => {
    if (!state.mensaje || !onGuardado) return;
    const id = setTimeout(onGuardado, 700);
    return () => clearTimeout(id);
  }, [state.mensaje, onGuardado]);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <TextField
        name="nombre"
        type="text"
        label="Nombre"
        autoComplete="name"
        required
        defaultValue={nombreInicial}
        error={state.fieldErrors?.nombre?.[0]}
      />

      <TextField
        name="telefono"
        type="tel"
        label="Teléfono"
        hint="Lo usamos para soporte por WhatsApp."
        autoComplete="tel"
        inputMode="tel"
        required
        defaultValue={telefonoInicial}
        error={state.fieldErrors?.telefono?.[0]}
      />

      <FormError>{state.error}</FormError>
      {state.mensaje ? <p className={styles.exito}>{state.mensaje}</p> : null}

      <Button type="submit" loading={pending}>
        Guardar cambios
      </Button>
    </form>
  );
}
