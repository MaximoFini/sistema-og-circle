"use client";

// VGRP-33 — mismo patrón que RegistroForm (app/(auth)/registro/RegistroForm.tsx):
// useActionState + Server Action con Zod. Pre-cargado con los valores actuales
// (defaultValue) — el usuario edita lo que ya tiene, no arranca de un form vacío.

import { useActionState } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import { actualizarPerfil } from "./_actions";
import { INITIAL_ACTION_STATE } from "./_schemas";
import styles from "./perfil.module.css";

export function PerfilForm({
  nombreInicial,
  telefonoInicial,
}: {
  nombreInicial: string;
  telefonoInicial: string;
}) {
  const [state, formAction, pending] = useActionState(actualizarPerfil, INITIAL_ACTION_STATE);

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
