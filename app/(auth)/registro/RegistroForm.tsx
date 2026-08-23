"use client";

import { useActionState } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import { INITIAL_ACTION_STATE, registrarse } from "../_actions";
import styles from "../auth.module.css";

export function RegistroForm() {
  const [state, formAction, pending] = useActionState(registrarse, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <TextField
        name="nombre"
        type="text"
        label="Nombre"
        autoComplete="name"
        required
        error={state.fieldErrors?.nombre?.[0]}
      />

      <TextField
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        required
        error={state.fieldErrors?.email?.[0]}
      />

      <TextField
        name="telefono"
        type="tel"
        label="Teléfono"
        hint="Lo usamos para soporte por WhatsApp."
        autoComplete="tel"
        inputMode="tel"
        required
        error={state.fieldErrors?.telefono?.[0]}
      />

      <TextField
        name="password"
        type="password"
        label="Contraseña"
        hint="Al menos 8 caracteres."
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password?.[0]}
      />

      <FormError>{state.error}</FormError>

      <Button type="submit" fullWidth loading={pending}>
        Crear cuenta
      </Button>
    </form>
  );
}
