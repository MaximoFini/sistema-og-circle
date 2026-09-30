"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, FormError, PasswordField, TextField } from "@/components/ui";
import { INITIAL_ACTION_STATE } from "@/lib/forms/action-state";
import { iniciarSesion } from "../_actions";
import styles from "../auth.module.css";
import { GoogleLogo } from "../GoogleLogo";

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

      <FormError>{state.error}</FormError>

      <Button type="submit" fullWidth loading={pending} className={styles.expansivo}>
        Iniciar sesión
      </Button>

      <Link href="/recuperar" className={styles.link}>
        ¿Olvidaste tu contraseña?
      </Link>

      <div className={styles.social}>
        <div className={styles.divisor} aria-hidden="true">
          o
        </div>

        {/* Botón de UI únicamente: la integración con Google todavía no está
            hecha (queda deshabilitado hasta que exista la Server Action). */}
        <Button
          type="button"
          variant="ghost"
          fullWidth
          disabled
          className={styles.expansivo}
          title="Muy pronto vas a poder entrar con tu cuenta de Google."
        >
          <GoogleLogo />
          Continuar con Google
        </Button>
        <p className={styles.proximamente}>Próximamente</p>
      </div>
    </form>
  );
}
