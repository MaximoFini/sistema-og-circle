"use client";

import { useActionState } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import { solicitarReset } from "../_actions";
import { INITIAL_ACTION_STATE } from "../_schemas";
import styles from "../auth.module.css";

/**
 * VGRP-19. A diferencia de `LoginForm`/`RegistroForm`, el camino feliz de
 * este action NO redirige (no hay a dónde ir todavía: el usuario tiene que
 * ir a revisar su mail) — `solicitarReset` devuelve `state.mensaje` y este
 * componente reemplaza el form por la confirmación. Ese mensaje es SIEMPRE
 * el mismo exista o no la cuenta (ver docs/AUTH.md, "Enumeración de
 * emails") — no se agrega acá ningún condicional que lo distinga.
 */
export function RecuperarForm() {
  const [state, formAction, pending] = useActionState(solicitarReset, INITIAL_ACTION_STATE);

  if (state.mensaje) {
    return (
      <div className={styles.disabledCard}>
        <p>{state.mensaje}</p>
      </div>
    );
  }

  return (
    <form action={formAction} className={styles.form} noValidate>
      <TextField
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        required
        error={state.fieldErrors?.email?.[0]}
      />

      <FormError>{state.error}</FormError>

      <Button type="submit" fullWidth loading={pending}>
        Mandar link de recuperación
      </Button>
    </form>
  );
}
