"use client";

// Panel (modal) de alta y edición de un video del editor de /admin/contenido/videos.
//
// Es el mismo panel para las dos cosas: tocar una casilla vacía lo abre en modo "crear"
// (el stage ya viene fijado por la grilla, no hay selector) y tocar una casilla con video lo
// abre en modo "editar". Mismo mecanismo de diálogo accesible que DatosModal/NavDrawer
// (createPortal + role="dialog" + aria-modal + foco atrapado + cierre por Escape), pero el
// bloqueo de scroll usa el contador compartido (useBodyScrollLock) en vez de guardar y
// restaurar el `overflow` previo.
//
// Los errores (400 por campo, 409 de stage completo, fallo de red) se muestran ADENTRO y el
// panel se queda abierto con lo que el admin escribió: nunca se pierde el trabajo.

import { type FormEvent, useCallback, useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { Button, Checkbox, FormError, Icon } from "@/components/ui";
import { useBodyScrollLock } from "@/components/ui/useBodyScrollLock";
import type { VideoEditor } from "@/lib/data/admin/contenido";
import { videoProvider } from "@/lib/video/provider";
import adminStyles from "../../admin.module.css";
import styles from "./videos-editor.module.css";
import { type FilaVideoApi, filaAVideoEditor } from "./videos-editor-estado";

const SELECTOR_FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

const URL_BASE = "/api/admin/contenido/videos";

export type VideoPanelProps = (
  | { modo: "crear"; stage: 1 | 2 }
  | { modo: "editar"; video: VideoEditor }
) & {
  onGuardado: (video: VideoEditor) => void;
  onCerrar: () => void;
};

interface RespuestaError {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export function VideoPanel(props: VideoPanelProps) {
  const { onGuardado, onCerrar } = props;
  const editando = props.modo === "editar" ? props.video : null;
  const stage = props.modo === "crear" ? props.stage : (editando?.stage ?? 1);

  const [titulo, setTitulo] = useState(editando?.titulo ?? "");
  const [descripcion, setDescripcion] = useState(editando?.descripcion ?? "");
  const [link, setLink] = useState(editando?.providerRef ?? "");
  // Un video nuevo creado desde una casilla se publica por defecto: el admin espera verlo
  // en la grilla al guardar. Si quiere dejarlo como borrador, desmarca la casilla.
  const [publicado, setPublicado] = useState(editando ? editando.publicado : true);
  const [enviando, setEnviando] = useState(false);
  const [despublicando, setDespublicando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});

  const panelRef = useRef<HTMLDivElement>(null);

  useBodyScrollLock(true);

  useEffect(() => {
    // Foco inicial en el primer campo (el primer focuseable es el botón "Cerrar").
    panelRef.current?.querySelector<HTMLElement>("input, textarea")?.focus();
  }, []);

  const onKeyDown = useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onCerrar();
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
    [onCerrar],
  );

  /** Manda el body, y según la respuesta cierra (OK) o muestra el error sin cerrar. */
  async function enviar(body: Record<string, unknown>, esDespublicar = false) {
    esDespublicar ? setDespublicando(true) : setEnviando(true);
    setError(null);
    setErroresCampo({});

    try {
      const res = await fetch(editando ? `${URL_BASE}/${editando.id}` : URL_BASE, {
        method: editando ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const fila = (await res.json()) as FilaVideoApi;
        onGuardado(filaAVideoEditor(fila));
        return;
      }

      const data = (await res.json().catch(() => ({}))) as RespuestaError;
      const primerCampo: Record<string, string> = {};
      for (const [campo, mensajes] of Object.entries(data.fieldErrors ?? {})) {
        if (mensajes?.[0]) primerCampo[campo] = mensajes[0];
      }
      setErroresCampo(primerCampo);
      setError(data.error ?? "No se pudo guardar.");
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setEnviando(false);
      setDespublicando(false);
    }
  }

  function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const datos = {
      titulo,
      descripcion: descripcion.trim() === "" ? null : descripcion,
      provider_ref: link,
      publicado,
    };
    // En alta el stage lo fija la grilla; en edición NO se envía (no se puede cambiar).
    void enviar(editando ? datos : { stage, ...datos });
  }

  function ariaCampo(campo: string, ayuda: boolean) {
    const describedby = [ayuda && `ayuda-${campo}`, erroresCampo[campo] && `error-${campo}`]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": erroresCampo[campo] ? true : undefined,
      "aria-describedby": describedby || undefined,
    };
  }

  const ocupado = enviando || despublicando;

  return createPortal(
    <>
      <div className={styles.overlay} onClick={onCerrar} aria-hidden="true" />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="video-panel-titulo"
        className={styles.panel}
        onKeyDown={onKeyDown}
      >
        <div className={styles.cuerpo}>
          <div className={styles.cabecera}>
            <div className={styles.cabeceraTexto}>
              <p className={styles.eyebrow}>Stage {stage}</p>
              <h2 className={styles.tituloPanel} id="video-panel-titulo">
                {editando ? "Editar video" : "Agregar video"}
              </h2>
            </div>
            <button type="button" className={styles.cerrar} onClick={onCerrar} aria-label="Cerrar">
              <Icon name="cerrar" size={18} />
            </button>
          </div>

          <form className={styles.form} onSubmit={onSubmit}>
            {/* biome-ignore lint/a11y/noLabelWithoutControl: el <input> está anidado adentro. */}
            <label className={adminStyles.formCampo}>
              <span className={adminStyles.formLabel}>Título *</span>
              <input
                type="text"
                className={adminStyles.inputNativo}
                {...ariaCampo("titulo", false)}
                value={titulo}
                onChange={(e) => setTitulo(e.target.value)}
              />
              {erroresCampo.titulo ? (
                <FormError id="error-titulo">{erroresCampo.titulo}</FormError>
              ) : null}
            </label>

            {/* biome-ignore lint/a11y/noLabelWithoutControl: el <textarea> está anidado adentro. */}
            <label className={adminStyles.formCampo}>
              <span className={adminStyles.formLabel}>Descripción</span>
              <textarea
                className={adminStyles.textareaNativo}
                {...ariaCampo("descripcion", false)}
                value={descripcion}
                onChange={(e) => setDescripcion(e.target.value)}
              />
              {erroresCampo.descripcion ? (
                <FormError id="error-descripcion">{erroresCampo.descripcion}</FormError>
              ) : null}
            </label>

            {/* biome-ignore lint/a11y/noLabelWithoutControl: el <input> está anidado adentro. */}
            <label className={adminStyles.formCampo}>
              <span className={adminStyles.formLabel}>
                Link del video de {videoProvider.nombre}
              </span>
              <span id="ayuda-provider_ref" className={adminStyles.formAyuda}>
                Pegá el link completo tal cual lo copiás de {videoProvider.nombre}. El id del video
                se extrae solo al guardar.
              </span>
              <input
                type="text"
                className={adminStyles.inputNativo}
                {...ariaCampo("provider_ref", true)}
                value={link}
                onChange={(e) => setLink(e.target.value)}
              />
              {erroresCampo.provider_ref ? (
                <FormError id="error-provider_ref">{erroresCampo.provider_ref}</FormError>
              ) : null}
            </label>

            <Checkbox
              label="Publicado"
              checked={publicado}
              onChange={(e) => setPublicado(e.target.checked)}
            />

            <FormError>{error}</FormError>

            <div className={styles.acciones}>
              <Button type="submit" loading={enviando} disabled={ocupado}>
                {editando ? "Guardar cambios" : "Agregar"}
              </Button>
              {editando?.publicado ? (
                <Button
                  type="button"
                  variant="ghost"
                  loading={despublicando}
                  disabled={ocupado}
                  onClick={() => void enviar({ publicado: false }, true)}
                >
                  Despublicar
                </Button>
              ) : null}
              <Button type="button" variant="ghost" disabled={ocupado} onClick={onCerrar}>
                Cancelar
              </Button>
            </div>
          </form>
        </div>
      </div>
    </>,
    document.body,
  );
}
