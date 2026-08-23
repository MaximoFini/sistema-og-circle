import Link from "next/link";
import { getFlags } from "@/lib/config";
import styles from "../auth.module.css";
import { RegistroForm } from "./RegistroForm";

// El registro está gateado por `flags.registro_habilitado` (lib/config,
// Edge Config). Hoy resuelve `false` por default porque el store de Edge
// Config todavía no existe — es correcto que esta pantalla no deje
// registrar todavía; el chequeo se queda igual para cuando se prenda.
//
// `force-dynamic` es necesario acá: esta página no usa ninguna API dinámica
// de Next (no lee cookies ni searchParams), así que sin esto Next la
// prerenderiza como estática en build time — congelando el valor de
// `registro_habilitado` de ESE momento para siempre, hasta el próximo
// deploy. Eso rompe el propósito entero del flag (poder prenderlo desde
// Edge Config sin redeployar). Mismo patrón que
// `app/api/auth/send-email/route.tsx`.
export const dynamic = "force-dynamic";

export default async function RegistroPage() {
  const flags = await getFlags();

  if (!flags.registro_habilitado) {
    return (
      <>
        <div className={styles.header}>
          <h1 className={styles.title}>Crear cuenta</h1>
        </div>

        <div className={styles.disabledCard}>
          <p>El registro todavía no está habilitado. Volvé a intentarlo más adelante.</p>
        </div>

        <div className={styles.footer}>
          <p className={styles.subtitle}>
            ¿Ya tenés cuenta?{" "}
            <Link href="/login" className={styles.link}>
              Iniciá sesión
            </Link>
          </p>
        </div>
      </>
    );
  }

  return (
    <>
      <div className={styles.header}>
        <h1 className={styles.title}>Crear cuenta</h1>
        <p className={styles.subtitle}>Registrate para acceder a OG Circle.</p>
      </div>

      <RegistroForm />

      <div className={styles.footer}>
        <p className={styles.subtitle}>
          ¿Ya tenés cuenta?{" "}
          <Link href="/login" className={styles.link}>
            Iniciá sesión
          </Link>
        </p>
      </div>
    </>
  );
}
