import Link from "next/link";
import { getVerifiedClaims } from "@/lib/auth/server";
import styles from "../../auth.module.css";
import { NuevaPasswordForm } from "./NuevaPasswordForm";

// VGRP-19 — define la contraseña nueva. Destino de `app/auth/callback/route.ts`
// tras canjear el `code` del mail de recuperación.
//
// Los tres mensajes de error posibles vienen en `?error=` (ver el comentario
// grande en `app/auth/callback/route.ts` sobre cómo se distinguen, y dónde
// dos casos quedan agrupados a propósito). Si no hay `error` pero tampoco
// hay sesión — alguien navegó acá directo sin pasar por el callback, o el
// canje pasó pero la cookie no llegó por algún motivo — se trata igual que
// un link inválido: sin sesión no hay nada que esta pantalla pueda hacer.
const MENSAJES_ERROR: Record<string, string> = {
  usado: "Este link ya fue usado. Pedí uno nuevo para recuperar tu contraseña.",
  vencido: "Este link venció. Pedí uno nuevo para recuperar tu contraseña.",
  invalido: "Este link no es válido. Pedí uno nuevo para recuperar tu contraseña.",
};

export default async function NuevaPasswordPage({
  searchParams,
}: {
  searchParams: Promise<{ error?: string }>;
}) {
  const { error } = await searchParams;
  const mensajeError = error ? MENSAJES_ERROR[error] : undefined;

  if (mensajeError) {
    return <ErrorCard mensaje={mensajeError} />;
  }

  const claims = await getVerifiedClaims();
  if (!claims) {
    return <ErrorCard mensaje={MENSAJES_ERROR.invalido} />;
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Elegí tu nueva contraseña</h1>
        <p className={styles.subtitle}>Ya podés definir la contraseña con la que vas a entrar.</p>
      </div>

      <NuevaPasswordForm />
    </>
  );
}

function ErrorCard({ mensaje }: { mensaje: string }) {
  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Elegí tu nueva contraseña</h1>
      </div>

      <div className={styles.disabledCard}>
        <p>{mensaje}</p>
      </div>

      <div className={styles.footer}>
        <p className={styles.subtitle}>
          <Link href="/recuperar" className={styles.link}>
            Pedir un link nuevo
          </Link>
        </p>
      </div>
    </>
  );
}
