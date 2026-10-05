"use client";

import { useActionState } from "react";
import { Button, Checkbox, FormError, PasswordField, TextField } from "@/components/ui";
import { DEFAULT_REDIRECT } from "@/lib/auth/redirect";
import { INITIAL_ACTION_STATE } from "@/lib/forms/action-state";
import { registrarse } from "../_actions";
import styles from "../auth.module.css";
import { BotonGoogle } from "../BotonGoogle";

export function RegistroForm() {
  const [state, formAction, pending] = useActionState(registrarse, INITIAL_ACTION_STATE);

  return (
    <form action={formAction} className={styles.form} noValidate>
      {/* Google primero (VGRP-76): es el registro en un clic, el camino que
          queremos que tome quien llega desde la landing. */}
      <BotonGoogle next={DEFAULT_REDIRECT} />

      <div className={styles.divisor} aria-hidden="true">
        o con tu email
      </div>

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
        autoComplete="tel"
        inputMode="tel"
        required
        error={state.fieldErrors?.telefono?.[0]}
      />

      <PasswordField
        name="password"
        label="Contraseña"
        hint="Al menos 8 caracteres."
        autoComplete="new-password"
        required
        error={state.fieldErrors?.password?.[0]}
      />

      <Checkbox
        name="aceptaTerminos"
        value="true"
        required
        error={state.fieldErrors?.aceptaTerminos?.[0]}
        label={
          <>
            Acepto los{" "}
            <a href="/terminos" target="_blank" rel="noopener noreferrer">
              Términos y Condiciones
            </a>{" "}
            y la{" "}
            <a href="/privacidad" target="_blank" rel="noopener noreferrer">
              Política de Privacidad
            </a>
            .
          </>
        }
      />

      <FormError>{state.error}</FormError>

      <Button type="submit" fullWidth loading={pending}>
        Crear cuenta
      </Button>
    </form>
  );
}
