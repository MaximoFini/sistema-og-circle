"use client";

// VGRP-27 — header persistente de `(app)`. El shell en sí (5 destinos del
// drawer, logo) no depende de datos por-usuario — eso es lo que mantiene
// `app/(app)/layout.tsx` prerenderizado, sin `cookies()`/`getVerifiedClaims()`
// ahí. El nombre del pie del drawer SÍ es por-usuario: se resuelve con un
// fetch de CLIENTE (después de la hidratación) a `/api/perfil`, exactamente
// el patrón ya documentado en ese layout ("Client Component chico... fetch a
// un Route Handler") — nunca leyendo la sesión en el Server Component del
// shell.

import Image from "next/image";
import NextLink from "next/link";
import { useEffect, useRef, useState } from "react";
import { NavDrawer } from "./NavDrawer";
import styles from "./nav.module.css";
import type { PerfilResumen } from "./UserFooter";

export function DashboardHeader() {
  const [abierto, setAbierto] = useState(false);
  const [perfil, setPerfil] = useState<PerfilResumen | null>(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    let cancelado = false;

    fetch("/api/perfil")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: PerfilResumen | null) => {
        if (!cancelado) setPerfil(data);
      })
      .catch(() => {
        // Fallo silencioso: el pie del drawer cae a "Tu cuenta" (ver
        // UserFooter) — no es contenido crítico, no amerita reintento ni
        // mensaje de error.
      })
      .finally(() => {
        if (!cancelado) setCargandoPerfil(false);
      });

    return () => {
      cancelado = true;
    };
  }, []);

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

      <button
        ref={triggerRef}
        type="button"
        className={styles.abrir}
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
      >
        <IconoHamburguesa abierto={abierto} />
      </button>

      <NavDrawer
        abierto={abierto}
        onCerrar={() => setAbierto(false)}
        triggerRef={triggerRef}
        perfil={perfil}
        cargandoPerfil={cargandoPerfil}
      />
    </header>
  );
}

// Hamburguesa que se transforma en X: 3 barras, las de arriba/abajo rotan 45°
// hasta superponerse (la X) y la del medio se desvanece. `aria-hidden` porque
// el estado ya lo comunica `aria-expanded` del botón, no el ícono en sí.
function IconoHamburguesa({ abierto }: { abierto: boolean }) {
  return (
    <span className={styles.hamburguesa} data-abierto={abierto} aria-hidden="true">
      <span className={styles.barra} />
      <span className={styles.barra} />
      <span className={styles.barra} />
    </span>
  );
}
