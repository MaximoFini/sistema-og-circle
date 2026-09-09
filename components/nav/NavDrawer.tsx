"use client";

// VGRP-27 — drawer de navegación. Primer diálogo/overlay accesible construido
// en ESTE repo (no hay componente propio para reusar: `DemoModal.tsx` que
// documenta DESIGN.md pertenece a la landing pública, otro repo/deploy — ver
// requirements.md). Mecanismo: createPortal + role="dialog" + aria-modal +
// foco atrapado + cierre por Escape + scroll lock, siguiendo esas mismas
// prácticas ya validadas en el sistema de diseño, sin librería nueva.

import NextLink from "next/link";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { DESTINOS_NAV } from "./destinos";
import styles from "./nav.module.css";
import { type PerfilResumen, UserFooter } from "./UserFooter";

export interface NavDrawerProps {
  abierto: boolean;
  onCerrar: () => void;
  /** Referencia al botón que abre el drawer — recupera el foco ahí al cerrar. */
  triggerRef: React.RefObject<HTMLButtonElement | null>;
  perfil: PerfilResumen | null;
  cargandoPerfil: boolean;
}

const SELECTOR_FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function NavDrawer({
  abierto,
  onCerrar,
  triggerRef,
  perfil,
  cargandoPerfil,
}: NavDrawerProps) {
  const panelRef = useRef<HTMLDivElement>(null);

  // Foco al primer elemento del drawer al abrir.
  useEffect(() => {
    if (!abierto) return;
    const primero = panelRef.current?.querySelector<HTMLElement>(SELECTOR_FOCUSABLE);
    primero?.focus();
  }, [abierto]);

  // Escape cierra y devuelve el foco al trigger; Tab/Shift+Tab quedan
  // atrapados dentro del panel mientras está abierto.
  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCerrar();
        triggerRef.current?.focus();
        return;
      }

      if (event.key !== "Tab" || !panelRef.current) return;

      const focusables = Array.from(
        panelRef.current.querySelectorAll<HTMLElement>(SELECTOR_FOCUSABLE),
      );
      if (focusables.length === 0) return;

      const primero = focusables[0];
      const ultimo = focusables[focusables.length - 1];

      if (event.shiftKey && document.activeElement === primero) {
        event.preventDefault();
        ultimo.focus();
      } else if (!event.shiftKey && document.activeElement === ultimo) {
        event.preventDefault();
        primero.focus();
      }
    },
    [onCerrar, triggerRef],
  );

  // Scroll lock del body mientras el drawer está abierto, restaurado al cerrar.
  useEffect(() => {
    if (!abierto) return;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto]);

  if (!abierto) return null;

  return createPortal(
    // Overlay y panel son HERMANOS a propósito, no padre-hijo: el overlay es
    // decorativo (sólo cierra al clickear afuera) y puede llevar
    // `aria-hidden`, pero si el diálogo fuera su hijo, ese `aria-hidden` en
    // el ancestro sacaría TODO el subárbol del árbol de accesibilidad —
    // diálogo incluido, aunque tenga su propio role/aria-modal. Encontrado
    // corriendo el E2E real (Playwright veía el nodo por querySelector pero
    // no por getByRole, el síntoma exacto de un ancestro aria-hidden). Al
    // ser hermanos, tampoco hace falta un `stopPropagation` en el panel:
    // un click ahí ya no tiene forma de burbujear al overlay.
    <>
      <div className={styles.overlay} onClick={onCerrar} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="Navegación"
        className={styles.panel}
        onKeyDown={onKeyDown}
      >
        <nav aria-label="Navegación principal" className={styles.nav}>
          <ul className={styles.lista}>
            {DESTINOS_NAV.map((destino) =>
              destino.proximamente ? (
                <li key={destino.href} className={styles.item}>
                  <span className={styles.destinoProximamente}>
                    {destino.label}
                    <span className={styles.badge}>Próximamente</span>
                  </span>
                </li>
              ) : (
                <li key={destino.href} className={styles.item}>
                  <NextLink href={destino.href} className={styles.destino} onClick={onCerrar}>
                    {destino.label}
                  </NextLink>
                </li>
              ),
            )}
          </ul>
        </nav>

        <UserFooter perfil={perfil} cargando={cargandoPerfil} />
      </div>
    </>,
    document.body,
  );
}
