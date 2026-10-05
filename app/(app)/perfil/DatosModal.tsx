"use client";

// VGRP-33 — botón "Ver datos" + modal con los datos personales (email de
// sólo lectura, nombre y teléfono editables vía PerfilForm). Mismo mecanismo
// de diálogo accesible que components/nav/NavDrawer.tsx (createPortal +
// role="dialog" + aria-modal + foco atrapado + cierre por Escape + scroll
// lock) — ver los comentarios de ese archivo para el razonamiento completo.
// No se comparte el hook entre los dos porque NavDrawer no expone uno: se
// duplica la lógica, no se improvisa una abstracción a mitad de camino.

import { useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Icon } from "@/components/ui";
import { PerfilForm } from "./PerfilForm";
import styles from "./perfil.module.css";

const SELECTOR_FOCUSABLE = 'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])';

export function DatosModal({
  email,
  nombreInicial,
  telefonoInicial,
}: {
  email: string;
  nombreInicial: string;
  telefonoInicial: string;
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

  useEffect(() => {
    if (!abierto) return;
    const overflowPrevio = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = overflowPrevio;
    };
  }, [abierto]);

  return (
    <>
      <div className={styles.encabezadoAcciones}>
        {telefonoInicial ? null : <span className={styles.avisoTelefono}>Falta tu teléfono</span>}
        <Button
          ref={triggerRef}
          type="button"
          variant="ghost"
          size="sm"
          aria-haspopup="dialog"
          onClick={() => setAbierto(true)}
        >
          Ver datos
        </Button>
      </div>

      {abierto
        ? createPortal(
            <>
              <div className={styles.modalOverlay} onClick={cerrar} aria-hidden="true" />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby="datos-modal-titulo"
                className={styles.modalPanel}
                onKeyDown={onKeyDown}
              >
                <div className={styles.modalCuerpo}>
                  <div className={styles.modalCabecera}>
                    <div className={styles.cardCabecera}>
                      <h2 className={styles.h2} id="datos-modal-titulo">
                        Tus datos
                      </h2>
                      <p className={styles.email}>{email}</p>
                    </div>
                    <button
                      type="button"
                      className={styles.modalCerrar}
                      onClick={cerrar}
                      aria-label="Cerrar"
                    >
                      <Icon name="cerrar" size={18} />
                    </button>
                  </div>

                  <PerfilForm
                    nombreInicial={nombreInicial}
                    telefonoInicial={telefonoInicial}
                    onGuardado={cerrar}
                  />
                </div>
              </div>
            </>,
            document.body,
          )
        : null}
    </>
  );
}
