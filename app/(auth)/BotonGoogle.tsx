"use client";

// VGRP-76 — "Continuar con Google", compartido entre login y registro.
//
// `signInWithOAuth` corre desde el cliente del navegador (y no desde una
// Server Action) porque el flujo PKCE guarda el `code_verifier` en una cookie
// que el browser client escribe antes de salir a Google; el callback
// (`app/auth/callback/google/route.ts`) la lee al canjear el `code`.
//
// Al volver, el callback registra la aceptación de Términos: por eso el texto
// legal va pegado al botón, en las dos pantallas (decisión del Bloque 15:
// sin pantalla de onboarding post-Google).

import { useState } from "react";
import { Button, FormError } from "@/components/ui";
import { createSupabaseBrowserClient } from "@/lib/auth/browser";
import styles from "./auth.module.css";
import { GoogleLogo } from "./GoogleLogo";

export function BotonGoogle({ next, className }: { next: string; className?: string }) {
  const [cargando, setCargando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function continuarConGoogle() {
    setCargando(true);
    setError(null);

    const callback = new URL("/auth/callback/google", window.location.origin);
    callback.searchParams.set("next", next);

    const { error } = await createSupabaseBrowserClient().auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: callback.toString() },
    });

    // Sin error, el navegador ya está saliendo hacia Google: el botón queda
    // cargando hasta que la página cambie.
    if (error) {
      setCargando(false);
      setError("No pudimos conectar con Google. Probá de nuevo o usá tu email.");
    }
  }

  return (
    <div className={styles.social}>
      <Button
        type="button"
        variant="ghost"
        fullWidth
        loading={cargando}
        onClick={continuarConGoogle}
        className={className}
      >
        <GoogleLogo />
        Continuar con Google
      </Button>

      <FormError>{error}</FormError>

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
