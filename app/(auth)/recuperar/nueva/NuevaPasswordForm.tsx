"use client";

import { useActionState } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import { definirNuevaPassword, INITIAL_ACTION_STATE } from "../../_actions";
import styles from "../../auth.module.css";

/**
 * VGRP-19. El camino feliz de `definirNuevaPassword` redirige a
 * `/dashboard` (la sesión ya existe desde el canje del callback — ver el
 * comentario del action), así que este componente sólo necesita manejar el
 * camino de error, igual que `LoginForm`.
 */
export function NuevaPasswordForm() {
  const [state, formAction, pending] = useActionState(definirNuevaPassword, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <TextField
        name="password"
        type="password"
        label="Contraseña nueva"
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password?.[0]}
      />

      <FormError>{state.error}</FormError>

      <Button type="submit" fullWidth loading={pending}>
        Guardar contraseña
      </Button>
    </form>
  );
}
