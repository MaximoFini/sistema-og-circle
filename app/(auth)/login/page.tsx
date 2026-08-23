import Link from "next/link";
import { safeRedirectPath } from "@/lib/auth/redirect";
import styles from "../auth.module.css";
import { LoginForm } from "./LoginForm";

// Destino real del redirect que hace `middleware.ts` (VGRP-17) cuando no hay
// sesión válida en rutas de `(app)`. El middleware pone `?next=<path original>`
// — se valida acá con `safeRedirectPath()` (nunca se usa `next` crudo, ver el
// comentario grande en `lib/auth/redirect.ts`) y se pasa a la Server Action
// como campo oculto del form.
export default async function LoginPage({
  searchParams,
}: {
  searchParams: Promise<{ next?: string }>;
}) {
  const { next: rawNext } = await searchParams;
  const next = safeRedirectPath(rawNext);

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Iniciar sesión</h1>
        <p className={styles.subtitle}>Accedé a tu cuenta de OG Circle.</p>
      </div>

      <LoginForm next={next} />

      <div className={styles.footer}>
        <p className={styles.subtitle}>
          ¿No tenés cuenta?{" "}
          <Link href="/registro" className={styles.link}>
            Registrate
          </Link>
        </p>
      </div>
    </>
  );
}
