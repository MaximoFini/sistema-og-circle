import Link from "next/link";
import styles from "../auth.module.css";
import { RecuperarForm } from "./RecuperarForm";

// VGRP-19 — pide el email para iniciar la recuperación de contraseña.
// Mismo patrón que `login/page.tsx` (VGRP-18): Server Component estático +
// Client Component del form. Pública por definición (ver `PUBLIC_PREFIXES`
// en middleware.ts) — quien la visita, por definición, no tiene sesión.
export default function RecuperarPage() {
  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Recuperar contraseña</h1>
        <p className={styles.subtitle}>
          Ingresá tu email y te mandamos un link para elegir una contraseña nueva.
        </p>
      </div>

      <RecuperarForm />

      <div className={styles.footer}>
        <p className={styles.subtitle}>
          <Link href="/login" className={styles.link}>
            Volver a iniciar sesión
          </Link>
        </p>
      </div>
    </>
  );
}
