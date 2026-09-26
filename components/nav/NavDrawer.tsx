"use client";

// VGRP-27 — drawer de navegación. Primer diálogo/overlay accesible construido
// en ESTE repo (no hay componente propio para reusar: `DemoModal.tsx` que
// documenta DESIGN.md pertenece a la landing pública, otro repo/deploy — ver
// requirements.md). Mecanismo: createPortal + role="dialog" + aria-modal +
// foco atrapado + cierre por Escape + scroll lock, siguiendo esas mismas
// prácticas ya validadas en el sistema de diseño, sin librería nueva.

import NextLink from "next/link";
import { usePathname } from "next/navigation";
import { useCallback, useEffect, useRef } from "react";
import { createPortal } from "react-dom";
import { Icon } from "@/components/ui/Icon";
import { cerrarSesion } from "@/lib/auth/actions";
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
  const pathname = usePathname();

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
        {/* Cuenta arriba (no focuseable: el foco inicial va al primer
            destino, "Inicio" — e2e/dashboard-shell.spec.ts). */}
        <UserFooter perfil={perfil} cargando={cargandoPerfil} />

        <nav aria-label="Navegación principal" className={styles.nav}>
          <ul className={styles.lista}>
            {DESTINOS_NAV.map((destino) =>
              destino.proximamente ? (
                <li key={destino.href} className={styles.item}>
                  <span className={styles.destinoProximamente}>
                    <span className={styles.iconTile}>
                      <Icon name={destino.icono} size={18} />
                    </span>
                    <span className={styles.destinoLabel}>{destino.label}</span>
                    <span className={styles.badge}>Próximamente</span>
                  </span>
                </li>
              ) : (
                <li key={destino.href} className={styles.item}>
                  <NextLink
                    href={destino.href}
                    className={styles.destino}
                    onClick={onCerrar}
                    aria-current={esActual(pathname, destino.href) ? "page" : undefined}
                  >
                    <span className={styles.iconTile}>
                      <Icon name={destino.icono} size={18} />
                    </span>
                    <span className={styles.destinoLabel}>{destino.label}</span>
                    <Icon
                      name={destino.href.startsWith("/") ? "chevron" : "externo"}
                      size={16}
                      className={styles.chevron}
                    />
                  </NextLink>
                </li>
              ),
            )}
          </ul>
        </nav>

        <form action={cerrarSesion}>
          <button type="submit" className={styles.salir}>
            <Icon name="salir" size={18} />
            Cerrar sesión
          </button>
        </form>
      </div>
    </>,
    document.body,
  );
}

// `/dashboard/principiante` también es "Inicio": un destino interno está
// activo en su ruta exacta y en cualquier subruta.
function esActual(pathname: string, href: string): boolean {
  if (!href.startsWith("/")) return false;
  return pathname === href || pathname.startsWith(`${href}/`);
}
