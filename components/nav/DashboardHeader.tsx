// VGRP-27 — header persistente de `(app)`. El shell en sí (5 destinos del
// drawer, logo) no depende de datos por-usuario — eso es lo que mantiene
// `app/(app)/layout.tsx` prerenderizado, sin `cookies()`/`getVerifiedClaims()`
// ahí.
//
// VGRP-56 punto 2 — Server Component desde este ticket: el logo/wordmark de
// acá abajo son 100% estáticos y no necesitan cliente. Lo único que sí lo
// necesita (el `useState` del botón, el fetch de `/api/perfil` por-usuario,
// el prefetch de navegación) vive en la hoja `<MenuToggle>` — mismo criterio
// que documenta `app/(app)/layout.tsx` ("Client Component chico... montado
// dentro de un Suspense/hoja, no todo el shell").

import Image from "next/image";
import NextLink from "next/link";
import { MenuToggle } from "./MenuToggle";
import styles from "./nav.module.css";

export function DashboardHeader() {
  return (
    <header className={styles.header}>
      <NextLink href="/dashboard" className={styles.marca} aria-label="OG Circle — Inicio">
        {/* El archivo fuente (public/logo-og-circle.png) trae el ícono +
            "CIRCLE" apilado verticalmente. Acá sólo se muestra el ícono
            (recortado por CSS, sin generar un segundo asset) porque el
            wordmark ya lo pone el <span> de al lado en una tipografía más
            fina — mostrar los dos "CIRCLE" juntos sería redundante. */}
        <span className={styles.logoMark}>
          <Image
            src="/logo-og-circle.png"
            alt=""
            width={630}
            height={612}
            priority
            className={styles.logoFull}
          />
        </span>
        <span className={styles.wordmark}>OG CIRCLE</span>
      </NextLink>

      <MenuToggle />
    </header>
  );
}
