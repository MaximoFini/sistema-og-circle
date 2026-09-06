import NextLink from "next/link";
// VGRP-22 — se reusan las clases de `Button` (no el componente en sí) para
// el CTA de abajo: `Button` renderiza un `<button>`, y anidar un `<button>`
// dentro del `<a>` de `next/link` es HTML inválido (contenido interactivo
// anidado). Mismo look exacto, sin el elemento equivocado — ver el
// comentario puntual sobre el CTA más abajo.
import buttonStyles from "@/components/ui/Button.module.css";
import { getNivel } from "@/lib/auth/claims";
import { getVerifiedClaims } from "@/lib/auth/server";
import styles from "./dashboard.module.css";

// =============================================================================
// VGRP-18 — Dashboard mínimo, gateado por nivel.
//
// El estado más común de este bloque es `nivel === 'ninguno'` (usuario
// registrado sin pagar, ver CLAUDE.md/contexto de negocio): tiene que verse
// como un estado válido y cuidado, no como una pantalla rota. El checkout
// real detrás del CTA es VGRP-22 (Bloque 3): el CTA de abajo ya lleva a
// `/comprar`, donde vive la selección de nivel y el armado del pago.
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
          <NextLink href="/comprar" className={`${buttonStyles.button} ${buttonStyles.primary}`}>
            Comprar acceso
          </NextLink>
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
