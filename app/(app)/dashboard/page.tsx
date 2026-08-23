import { Button } from "@/components/ui";
import { getNivel } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import styles from "./dashboard.module.css";

// =============================================================================
// VGRP-18 — Dashboard mínimo, gateado por nivel.
//
// El estado más común de este bloque es `nivel === 'ninguno'` (usuario
// registrado sin pagar, ver CLAUDE.md/contexto de negocio): tiene que verse
// como un estado válido y cuidado, no como una pantalla rota. El checkout
// real detrás del CTA es Bloque 3 — acá el botón no lleva a ningún lado
// todavía a propósito.
//
// Este page.tsx SÍ puede leer `getVerifiedClaims()` (a diferencia del layout
// de `(app)`, ver el comentario de ese archivo): es contenido por-usuario de
// una página puntual, no el shell compartido.
// =============================================================================
export default async function DashboardPage() {
  const claims = await getVerifiedClaims();
  const nivel = getNivel(claims);

  if (nivel === "ninguno") {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <p className={styles.eyebrow}>Tu cuenta</p>
          <h1 className={styles.title}>Todavía no tenés acceso a ningún nivel</h1>
          <p className={styles.copy}>
            Comprá un nivel para desbloquear el contenido de la plataforma.
          </p>
          <Button variant="primary">Comprar acceso</Button>
        </div>
      </div>
    );
  }

  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <p className={styles.eyebrow}>Tu cuenta</p>
        <h1 className={styles.title}>Tenés acceso {nivel}</h1>
        <p className={styles.copy}>El contenido de este nivel llega en los próximos bloques.</p>
      </div>
    </div>
  );
}
