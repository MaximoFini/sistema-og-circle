import Image from "next/image";
import type { ReactNode } from "react";
import styles from "./layout.module.css";

// =============================================================================
// VGRP-18 — Shell de `(auth)`: estático, mismo criterio que `(app)/layout.tsx`
// (VGRP-17).
//
// No lee cookies ni llama a `getVerifiedClaims()` / `createSupabaseServerClient()`:
// no tiene nada que decidir por sesión. Las rutas de este grupo (`/login`,
// `/registro`) son públicas por definición (ver `PUBLIC_PREFIXES` en
// `middleware.ts`) — quien las visita, por definición, todavía no tiene una
// sesión que valga la pena leer acá. Todo lo dinámico (validar el form,
// autenticar) vive en las Server Actions de `_actions.ts`, no en este layout.
//
// Diseño: centrado y mínimo (como el inicio de sesión de Apple) — isotipo
// arriba, formulario en una hoja de vidrio. Sin panel de marketing.
// =============================================================================
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      {/* Tres piezas en una grilla: bloque de marca (lockup + frase, juntos
          como una firma), formulario y pie. Mobile: apiladas y centradas.
          Desde 1024px: la marca a la izquierda, centrada verticalmente contra
          el formulario; el pie debajo del formulario. */}
      <div className={styles.layout}>
        <div className={styles.hero}>
          <div className={styles.marca}>
            <span className={styles.logoTile} aria-hidden="true">
              <span className={styles.logoMark}>
                {/* Mismo recorte del isotipo que components/nav (sprite crop). */}
                <Image
                  src="/logo-og-circle.png"
                  alt=""
                  width={47}
                  height={45}
                  className={styles.logoFull}
                />
              </span>
            </span>
            <span className={styles.wordmark}>OG Circle</span>
          </div>

          {/* Cortes controlados en desktop ("El círculo / de los que /
              importan."): cada .linea es block desde 1024px; en mobile son
              inline y el texto fluye solo. */}
          <p className={styles.frase}>
            <span className={styles.linea}>El círculo </span>
            <span className={styles.linea}>de los que </span>
            <span className={`${styles.linea} ${styles.fraseAcento}`}>importan</span>.
          </p>
        </div>

        <main className={styles.card}>{children}</main>

        <p className={styles.pie}>© OG Circle</p>
      </div>
    </div>
  );
}
