"use client";

// Botón "Cerrar sesión" con confirmación — compartido entre el drawer de
// navegación (components/nav/NavDrawer.tsx), Perfil (app/(app)/perfil/page.tsx)
// y el panel de admin (app/admin/layout.tsx): mismo flujo de logout, mismo
// diálogo de confirmación, no se reimplementa por superficie (mismo criterio
// que lib/auth/actions.ts).
//
// El trigger visual (className + children) lo define cada caller para
// mantener sus estilos actuales — este componente sólo agrega el estado y el
// diálogo. La confirmación en sí usa el mismo mecanismo de diálogo accesible
// que NavDrawer/DatosModal (createPortal + role="dialog" + aria-modal + foco
// atrapado + Escape + scroll lock): 3ª vez que se repite este patrón en el
// repo, se sigue duplicando a propósito en vez de improvisar un hook a mitad
// de camino (mismo razonamiento que el comentario de DatosModal.tsx).
//
// Mobile: hoja inferior. Desde 640px: diálogo centrado (a diferencia del
// popover anclado de NavDrawer, acá el trigger puede estar en 3 layouts
// distintos — no hay un único botón fijo contra el que anclar).

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useBodyScrollLock } from "@/components/ui/useBodyScrollLock";
import { cerrarSesion } from "@/lib/auth/actions";
import styles from "./CerrarSesionBoton.module.css";

const SELECTOR_FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function CerrarSesionBoton({
  className,
  children,
}: {
  className?: string;
  children: React.ReactNode;
}) {
  const [abierto, setAbierto] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const cerrar = useCallback(() => {
    setAbierto(false);
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!abierto) return;
    const primero = panelRef.current?.querySelector<HTMLElement>(SELECTOR_FOCUSABLE);
    primero?.focus();
  }, [abierto]);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        cerrar();
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
    [cerrar],
  );

  // Contador compartido, no "guardar y restaurar": ver el comentario en NavDrawer.
  useBodyScrollLock(abierto);

  return (
    <>
      <button ref={triggerRef} type="button" className={className} onClick={() => setAbierto(true)}>
        {children}
      </button>

      {abierto
        ? createPortal(
            <>
              <div className={styles.overlay} onClick={cerrar} aria-hidden="true" />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="cerrar-sesion-titulo"
                aria-describedby="cerrar-sesion-descripcion"
                className={styles.panel}
                onKeyDown={onKeyDown}
              >
                <h2 className={styles.titulo} id="cerrar-sesion-titulo">
                  ¿Cerrar sesión?
                </h2>
                <p className={styles.descripcion} id="cerrar-sesion-descripcion">
                  Vas a tener que volver a iniciar sesión para acceder a tu cuenta.
                </p>

                <div className={styles.botones}>
                  <form action={cerrarSesion}>
                    <button type="submit" className={styles.confirmar}>
                      Cerrar sesión
                    </button>
                  </form>
                  <button type="button" className={styles.cancelar} onClick={cerrar}>
                    Cancelar
                  </button>
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
