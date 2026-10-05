"use client";

// VGRP-76 — "Continuar con Google", compartido entre login y registro.
//
// Vive adentro del <form> de cada pantalla, así que no puede ser otro form:
// es un botón de submit con su propio `formAction` (la Server Action
// `continuarConGoogle`, que arma la URL de Google en el servidor y redirige).
// El navegador no carga `supabase-js` para esto — ver `_actions.ts`.
//
// Al volver, el callback registra la aceptación de Términos: por eso el texto
// legal va pegado al botón, en las dos pantallas (decisión del Bloque 15:
// sin pantalla de onboarding post-Google).

import { useOptimistic } from "react";
import { Button } from "@/components/ui";
import { continuarConGoogle } from "./_actions";
import styles from "./auth.module.css";
import { GoogleLogo } from "./GoogleLogo";

export function BotonGoogle({ next, className }: { next: string; className?: string }) {
  // `useOptimistic` y no `useState`: un `setState` común dentro de la action
  // no se pinta hasta que termina, y esta termina saliendo de la página (a
  // Google, o a `/login?error=google`). Tampoco sirve marcarlo en `onClick`:
  // un botón deshabilitado antes del submit cancela el submit.
  const [cargando, marcarCargando] = useOptimistic(false);

  async function irAGoogle() {
    marcarCargando(true);
    await continuarConGoogle(next);
  }

  return (
    <div className={styles.social}>
      <Button
        type="submit"
        variant="ghost"
        fullWidth
        formAction={irAGoogle}
        formNoValidate
        loading={cargando}
        className={className}
      >
        <GoogleLogo />
        Continuar con Google
      </Button>

      <p className={styles.legalGoogle}>
        Al continuar con Google aceptás los{" "}
        <a href="/terminos" target="_blank" rel="noopener noreferrer">
          Términos y Condiciones
        </a>{" "}
        y la{" "}
        <a href="/privacidad" target="_blank" rel="noopener noreferrer">
          Política de Privacidad
        </a>
        .
      </p>
    </div>
  );
}
