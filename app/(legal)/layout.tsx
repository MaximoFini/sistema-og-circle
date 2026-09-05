import Link from "next/link";
import type { ReactNode } from "react";
import styles from "./layout.module.css";

// =============================================================================
// VGRP-34 — Shell de `(legal)`: estático, mismo criterio que `(auth)/layout.tsx`
// (VGRP-18) y `(app)/layout.tsx` (VGRP-17).
//
// Las cuatro rutas de este grupo (`/legales`, `/terminos`, `/privacidad`,
// `/reembolsos`) son públicas por definición — ya están en `PUBLIC_PREFIXES`
// de `middleware.ts`, precargadas desde VGRP-17 para este ticket. Por eso
// este layout no lee cookies ni llama a `getVerifiedClaims()` /
// `createSupabaseServerClient()`: no tiene sesión que valga la pena resolver,
// se linkea tanto desde el registro (sin sesión) como desde el footer de
// `(app)` (con sesión) y en ambos casos se ve exactamente igual.
//
// El link "← Volver a legales" NO vive acá: en `/legales` mismo sería un
// link a sí misma. Lo agrega `LegalDocPage.tsx`, el chrome compartido de las
// tres páginas de documento — el índice no lo necesita, ya que su contenido
// son esos tres links.
// =============================================================================
export default function LegalLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <div className={styles.wrap}>
        <header className={styles.header}>
          <Link href="/legales" className={styles.brand}>
            OG Circle
          </Link>
        </header>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  );
}
