"use client";

// VGRP-56 punto 2 — hoja de Client Component separada de DashboardHeader.tsx.
// Lo único que necesita cliente acá es el `useState(abierto)` del botón, el
// fetch de `/api/perfil` (por-usuario, después de hidratar) y el prefetch de
// navegación (VGRP-55 punto 6) — el logo/wordmark de DashboardHeader.tsx son
// estáticos y no necesitan ninguno de los dos.

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { DESTINOS_NAV } from "./destinos";
import { NavDrawer } from "./NavDrawer";
import styles from "./nav.module.css";
import type { PerfilResumen } from "./UserFooter";

// VGRP-55 punto 6 — NavDrawer hace `if (!abierto) return null` (accesibilidad:
// nunca se dejan sus <NextLink> montados-pero-ocultos en el orden de
// tabulación, ver el comentario de ese archivo), así que Next nunca los
// prefetchea con el drawer cerrado — toda navegación desde el header arranca
// fría. Se prefetchean al hover/focus del botón de menú en vez de cambiar el
// mount del drawer: no toca nada de lo que e2e/dashboard-shell.spec.ts ya
// prueba (foco atrapado, Escape, "Próximamente" no navegable).
//
// Sólo los destinos INTERNOS y no "próximamente" son prefetcheables — la
// Calculadora es una URL externa (Next no la toca) y Comunidad/Tracking no
// tienen página real todavía.
const DESTINOS_PREFETCHEABLES = DESTINOS_NAV.filter(
  (destino) => destino.href.startsWith("/") && !destino.proximamente,
).map((destino) => destino.href);

export function MenuToggle() {
  const [abierto, setAbierto] = useState(false);
  const [perfil, setPerfil] = useState<PerfilResumen | null>(null);
  const [cargandoPerfil, setCargandoPerfil] = useState(true);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const router = useRouter();
  // Un solo prefetch por montaje alcanza — sin este guard, cada hover/focus
  // repetido del botón (alguien pasando el mouse de un lado a otro, o
  // tabulando de ida y vuelta) volvía a llamar router.prefetch() para los
  // mismos 2 destinos, sin ningún beneficio después del primero.
  const yaPrefetcheado = useRef(false);

  function prefetchDestinos() {
    if (yaPrefetcheado.current) return;
    yaPrefetcheado.current = true;
    for (const href of DESTINOS_PREFETCHEABLES) router.prefetch(href);
  }

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
    <>
      <button
        ref={triggerRef}
        type="button"
        className={styles.abrir}
        aria-label={abierto ? "Cerrar menú" : "Abrir menú"}
        aria-haspopup="dialog"
        aria-expanded={abierto}
        onClick={() => setAbierto((valor) => !valor)}
        onMouseEnter={prefetchDestinos}
        onFocus={prefetchDestinos}
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
    </>
  );
}

// Dos barras que se cruzan en una X. `aria-hidden` porque
// el estado ya lo comunica `aria-expanded` del botón, no el ícono en sí.
function IconoHamburguesa({ abierto }: { abierto: boolean }) {
  return (
    <span className={styles.hamburguesa} data-abierto={abierto} aria-hidden="true">
      <span className={styles.barra} />
      <span className={styles.barra} />
    </span>
  );
}
