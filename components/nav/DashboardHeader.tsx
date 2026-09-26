// VGRP-27 — header persistente de `(app)`. El shell en sí (destinos, logo)
// no depende de datos por-usuario — eso es lo que mantiene
// `app/(app)/layout.tsx` prerenderizado, sin `cookies()`/`getVerifiedClaims()`
// ahí.
//
// VGRP-56 punto 2 — Server Component: el logo/wordmark son 100% estáticos.
// Lo que necesita cliente vive en hojas chicas: `<RapidaNav>` (ruta activa,
// indicador deslizante) y `<MenuToggle>` (estado del menú, fetch de
// `/api/perfil`, prefetch de navegación).

import Image from "next/image";
import NextLink from "next/link";
import { MenuToggle } from "./MenuToggle";
import styles from "./nav.module.css";
import { RapidaNav } from "./RapidaNav";

export function DashboardHeader() {
  return (
    <div className={styles.headerWrap}>
      <header className={styles.header}>
        <NextLink href="/dashboard" className={styles.marca} aria-label="OG Circle — Inicio">
          {/* El archivo fuente (public/logo-og-circle.png) trae el ícono +
              "CIRCLE" apilado. Acá sólo se muestra el ícono, recortado por CSS
              (sin un segundo asset); el wordmark lo pone el <span> de al lado. */}
          <span className={styles.logoTile}>
            <span className={styles.logoMark}>
              {/* VGRP-56 punto 5 — width/height al tamaño PINTADO (.logoFull en
                  nav.module.css), no al del archivo fuente (630×612): si no, el
                  browser baja una variante enorme para pintar 46px. Sin
                  `priority`: es decorativo (alt=""), no es el LCP. */}
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
        </NextLink>

        <RapidaNav />
        <MenuToggle />
      </header>
    </div>
  );
}
