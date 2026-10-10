"use client";

// Editor de recorte de la foto de perfil (agentes / profesionales).
// Spec: specs/foto-perfil-agentes-profesionales (US-1).
//
// Se carga con next/dynamic desde CampoFoto.tsx: react-easy-crop sólo entra en
// el bundle de esta pantalla del admin, nunca en el del usuario.
//
// Diálogo accesible con el mismo mecanismo que DatosModal / CerrarSesionBoton /
// VideoPanel (createPortal + role="dialog" + aria-modal + foco atrapado +
// Escape + scroll lock), duplicado a propósito (ver el comentario de DatosModal).

import { useCallback, useEffect, useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Cropper, { type Area, type Point } from "react-easy-crop";
import { Button, FormError } from "@/components/ui";
import { useBodyScrollLock } from "@/components/ui/useBodyScrollLock";
import { recortarAFoto } from "@/lib/fotos/cliente";
import styles from "./foto.module.css";

const SELECTOR_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

const ZOOM_MIN = 1;
const ZOOM_MAX = 4;

export interface RecorteFotoModalProps {
  /** `blob:` URL del archivo original que eligió el admin. */
  imagenSrc: string;
  onConfirmar: (recorte: Blob) => void;
  onCancelar: () => void;
}

export default function RecorteFotoModal({
  imagenSrc,
  onConfirmar,
  onCancelar,
}: RecorteFotoModalProps) {
  const [crop, setCrop] = useState<Point>({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [area, setArea] = useState<Area | null>(null);
  const [procesando, setProcesando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const tituloId = useId();
  const ayudaId = useId();

  useBodyScrollLock(true);

  useEffect(() => {
    panelRef.current?.querySelector<HTMLElement>(SELECTOR_FOCUSABLE)?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCancelar();
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
    [onCancelar],
  );

  async function confirmar() {
    if (!area) return;
    setProcesando(true);
    setError(null);
    try {
      onConfirmar(await recortarAFoto(imagenSrc, area));
    } catch (e) {
      setError(e instanceof Error ? e.message : "No se pudo recortar la foto.");
      setProcesando(false);
    }
  }

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onCancelar} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={tituloId}
        aria-describedby={ayudaId}
        className={styles.panel}
        onKeyDown={onKeyDown}
      >
        <h2 className={styles.titulo} id={tituloId}>
          Encuadrá la foto
        </h2>
        <p className={styles.ayuda} id={ayudaId}>
          Arrastrá para mover y usá el zoom para acercar. Así se va a ver en el directorio.
        </p>

        <div className={styles.area}>
          <Cropper
            image={imagenSrc}
            crop={crop}
            zoom={zoom}
            minZoom={ZOOM_MIN}
            maxZoom={ZOOM_MAX}
            aspect={1}
            cropShape="round"
            showGrid={false}
            objectFit="cover"
            onCropChange={setCrop}
            onZoomChange={setZoom}
            onCropComplete={(_, pixeles) => setArea(pixeles)}
          />
        </div>

        <label className={styles.zoom}>
          <span className={styles.zoomLabel}>Zoom</span>
          <input
            type="range"
            min={ZOOM_MIN}
            max={ZOOM_MAX}
            step={0.01}
            value={zoom}
            onChange={(e) => setZoom(Number(e.target.value))}
            className={styles.zoomInput}
          />
        </label>

        <FormError>{error}</FormError>

        <div className={styles.botones}>
          <Button type="button" onClick={confirmar} loading={procesando} disabled={!area}>
            Usar esta foto
          </Button>
          <Button type="button" variant="ghost" onClick={onCancelar} disabled={procesando}>
            Cancelar
          </Button>
        </div>
      </div>
    </>,
    document.body,
  );
}
