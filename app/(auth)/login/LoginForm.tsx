"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import { INITIAL_ACTION_STATE, iniciarSesion } from "../_actions";
import styles from "../auth.module.css";

/**
 * `next` ya pasó por `safeRedirectPath()` en `page.tsx` (Server Component) —
 * acá sólo se transporta como campo oculto para que la Server Action lo
 * reciba en el mismo submit, sin depender de leer `searchParams` de nuevo
 * del lado del cliente.
 */
export function LoginForm({ next }: { next: string }) {
  const [state, formAction, pending] = useActionState(iniciarSesion, INITIAL_ACTION_STATE);

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
      />

      <TextField
        name="password"
        type="password"
        label="Contraseña"
        autoComplete="current-password"
        required
        error={state.fieldErrors?.password?.[0]}
      />

      <FormError>{state.error}</FormError>

      <Button type="submit" fullWidth loading={pending}>
        Iniciar sesión
      </Button>

      <Link href="/recuperar" className={styles.link}>
        ¿Olvidaste tu contraseña?
      </Link>
    </form>
  );
}
