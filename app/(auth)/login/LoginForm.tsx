"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, FormError, PasswordField, TextField } from "@/components/ui";
import { INITIAL_ACTION_STATE } from "@/lib/forms/action-state";
import { iniciarSesion } from "../_actions";
import styles from "../auth.module.css";
import { BotonGoogle } from "../BotonGoogle";

/**
 * `next` ya pasó por `safeRedirectPath()` en `page.tsx` (Server Component) —
 * acá sólo se transporta como campo oculto para que la Server Action lo
 * reciba en el mismo submit, sin depender de leer `searchParams` de nuevo
 * del lado del cliente.
 */
export function LoginForm({ next, errorGoogle }: { next: string; errorGoogle: boolean }) {
  const [state, formAction, pending] = useActionState(iniciarSesion, INITIAL_ACTION_STATE);
  // VGRP-76 — el callback de Google vuelve acá con `?error=google` si el
  // usuario canceló o el canje falló. Se muestra hasta el primer submit.
  const error =
    state.error ??
    (errorGoogle && state === INITIAL_ACTION_STATE
      ? "No pudimos entrar con Google. Probá de nuevo o usá tu email."
      : undefined);

  return (
    <form action={formAction} className={styles.form} noValidate>
      <input type="hidden" name="next" value={next} />

      <TextField
        name="email"
        type="email"
        label="Email"
        autoComplete="email"
        inputMode="email"
        required
        error={state.fieldErrors?.email?.[0]}
        className={styles.expansivo}
      />

      <PasswordField
        name="password"
        label="Contraseña"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password?.[0]}
        className={styles.expansivo}
      />

      <FormError>{error}</FormError>

      <Button type="submit" fullWidth loading={pending} className={styles.expansivo}>
        Iniciar sesión
      </Button>

      <Link href="/recuperar" className={styles.link}>
        ¿Olvidaste tu contraseña?
      </Link>

      <div className={styles.divisor} aria-hidden="true">
        o
      </div>

      <BotonGoogle next={next} className={styles.expansivo} />
    </form>
  );
}
