"use client";

// VGRP-38 — form de crear/editar, genérico por entidad. Los 4 CRUDs comparten
// exactamente el mismo mecanismo (fetch a /api/admin/contenido/:entidad[/:id]
// + manejo de error) — lo único que cambia entre entidades es QUÉ CAMPOS se
// muestran, así que eso es la única parte "hardcodeada por entidad" (CAMPOS
// de abajo), no el form en sí.

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, FormError } from "@/components/ui";
import { Constants } from "@/lib/database.types";
import { capitalizar } from "@/lib/format";
import { videoProvider } from "@/lib/video/provider";
import styles from "../../admin.module.css";

const NIVELES = Constants.public.Enums.nivel_acceso;

type TipoCampo = "text" | "textarea" | "number" | "nivel" | "checkbox" | "stage";

interface CampoConfig {
  name: string;
  label: string;
  tipo: TipoCampo;
  requerido?: boolean;
  /** Texto de ayuda debajo de la etiqueta. */
  ayuda?: string;
}

const CAMPOS: Record<string, CampoConfig[]> = {
  agentes: [
    { name: "nombre", label: "Nombre", tipo: "text", requerido: true },
    { name: "especialidad", label: "Especialidad", tipo: "text", requerido: true },
    { name: "nivel_requerido", label: "Nivel requerido", tipo: "nivel" },
    { name: "contacto", label: "Contacto (sensible — nunca sale sin el nivel)", tipo: "text" },
    { name: "orden", label: "Orden", tipo: "number" },
    { name: "activo", label: "Activo", tipo: "checkbox" },
  ],
  videos: [
    { name: "stage", label: "Stage", tipo: "stage" },
    { name: "titulo", label: "Título", tipo: "text", requerido: true },
    { name: "descripcion", label: "Descripción", tipo: "textarea" },
    {
      name: "provider_ref",
      label: `Link del video de ${videoProvider.nombre} (sensible)`,
      ayuda: `Pegá el link completo tal cual lo copiás de ${videoProvider.nombre} (botón Compartir o barra de direcciones). El id del video se extrae solo al guardar.`,
      tipo: "text",
    },
    {
      name: "nivel_requerido",
      label: "Nivel requerido (sin uso real hoy — VGRP-29)",
      tipo: "nivel",
    },
    { name: "orden", label: "Orden", tipo: "number" },
    { name: "publicado", label: "Publicado", tipo: "checkbox" },
  ],
  profesionales: [
    { name: "nombre", label: "Nombre", tipo: "text", requerido: true },
    { name: "rubro", label: "Rubro", tipo: "text", requerido: true },
    { name: "descripcion", label: "Descripción", tipo: "textarea" },
    { name: "contacto", label: "Contacto", tipo: "text" },
    { name: "orden", label: "Orden", tipo: "number" },
    { name: "activo", label: "Activo", tipo: "checkbox" },
  ],
  servicios_financieros: [
    { name: "titulo", label: "Título", tipo: "text", requerido: true },
    { name: "descripcion", label: "Descripción", tipo: "textarea" },
    { name: "nivel_requerido", label: "Nivel requerido", tipo: "nivel" },
    { name: "orden", label: "Orden", tipo: "number" },
    { name: "activo", label: "Activo", tipo: "checkbox" },
  ],
};

function valorPorDefecto(campo: CampoConfig): unknown {
  if (campo.tipo === "checkbox") return campo.name !== "publicado";
  if (campo.tipo === "number") return 0;
  if (campo.tipo === "stage") return 1;
  if (campo.tipo === "nivel") return "principiante";
  return "";
}

export interface ContenidoFormProps {
  entidad: string;
  /** Presente = editar; ausente = crear. */
  item?: Record<string, unknown> & { id: string };
}

interface RespuestaError {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

export function ContenidoForm({ entidad, item }: ContenidoFormProps) {
  const router = useRouter();
  const campos = CAMPOS[entidad] ?? [];
  const [valores, setValores] = useState<Record<string, unknown>>(() => {
    const inicial: Record<string, unknown> = {};
    for (const c of campos)
      inicial[c.name] = item ? (item[c.name] ?? valorPorDefecto(c)) : valorPorDefecto(c);
    return inicial;
  });
  const [enviando, setEnviando] = useState(false);
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [erroresCampo, setErroresCampo] = useState<Record<string, string>>({});

  const urlBase = `/api/admin/contenido/${entidad}`;
  const url = item ? `${urlBase}/${item.id}` : urlBase;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setErroresCampo({});

    try {
      const res = await fetch(url, {
        method: item ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valores),
      });

      if (res.ok) {
        router.push(`/admin/contenido/${entidad}`);
        router.refresh();
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
    }
  }

  async function onBorrar() {
    if (!item) return;
    if (!window.confirm("¿Borrar este ítem? Esta acción no se puede deshacer desde acá.")) return;

    setBorrando(true);
    setError(null);
    try {
      const res = await fetch(url, { method: "DELETE" });
      if (res.ok) {
        router.push(`/admin/contenido/${entidad}`);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as RespuestaError;
      setError(data.error ?? "No se pudo borrar.");
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setBorrando(false);
    }
  }

  // Mismo cableado a11y para todos los controles: la ayuda y el error del
  // campo (ids de abajo) se anuncian junto al control.
  function ariaCampo(campo: CampoConfig) {
    const error = erroresCampo[campo.name];
    const describedby = [campo.ayuda && `ayuda-${campo.name}`, error && `error-${campo.name}`]
      .filter(Boolean)
      .join(" ");
    return {
      "aria-invalid": error ? true : undefined,
      "aria-describedby": describedby || undefined,
    };
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={onSubmit}>
      {campos.map((campo) =>
        campo.tipo === "checkbox" ? (
          // Caso aparte: el checkbox lleva su propia etiqueta inline (dentro
          // del mismo <label>) — repetir el <span className={formLabel}> de
          // arriba duplicaría el texto de la etiqueta.
          <label key={campo.name} className={styles.formCampo}>
            <span className={styles.checkboxCampo}>
              <input
                type="checkbox"
                checked={Boolean(valores[campo.name])}
                onChange={(e) => setValores((v) => ({ ...v, [campo.name]: e.target.checked }))}
              />
              {campo.label}
            </span>
          </label>
        ) : (
          // biome-ignore lint/a11y/noLabelWithoutControl: el control (textarea/select/input) SIEMPRE está anidado adentro, en una de las 4 ramas del ternario de abajo — el linter no sigue esa cadena para confirmarlo.
          <label key={campo.name} className={styles.formCampo}>
            <span className={styles.formLabel}>
              {campo.label}
              {campo.requerido ? " *" : ""}
            </span>
            {campo.ayuda ? (
              <span id={`ayuda-${campo.name}`} className={styles.formAyuda}>
                {campo.ayuda}
              </span>
            ) : null}

            {campo.tipo === "textarea" ? (
              <textarea
                className={styles.textareaNativo}
                {...ariaCampo(campo)}
                value={(valores[campo.name] as string) ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [campo.name]: e.target.value }))}
              />
            ) : campo.tipo === "nivel" ? (
              <select
                className={styles.selectNativo}
                {...ariaCampo(campo)}
                value={(valores[campo.name] as string) ?? "principiante"}
                onChange={(e) => setValores((v) => ({ ...v, [campo.name]: e.target.value }))}
              >
                {NIVELES.map((n) => (
                  <option key={n} value={n}>
                    {capitalizar(n)}
                  </option>
                ))}
              </select>
            ) : campo.tipo === "stage" ? (
              <select
                className={styles.selectNativo}
                {...ariaCampo(campo)}
                value={String(valores[campo.name] ?? 1)}
                onChange={(e) =>
                  setValores((v) => ({ ...v, [campo.name]: Number(e.target.value) }))
                }
              >
                <option value="1">1</option>
                <option value="2">2</option>
                <option value="3">3 (explicativo de agentes)</option>
              </select>
            ) : campo.tipo === "number" ? (
              <input
                type="number"
                className={styles.inputNativo}
                {...ariaCampo(campo)}
                value={String(valores[campo.name] ?? 0)}
                onChange={(e) =>
                  setValores((v) => ({ ...v, [campo.name]: Number(e.target.value) }))
                }
              />
            ) : (
              <input
                type="text"
                className={styles.inputNativo}
                {...ariaCampo(campo)}
                value={(valores[campo.name] as string) ?? ""}
                onChange={(e) => setValores((v) => ({ ...v, [campo.name]: e.target.value }))}
              />
            )}
            {erroresCampo[campo.name] ? (
              <FormError id={`error-${campo.name}`}>{erroresCampo[campo.name]}</FormError>
            ) : null}
          </label>
        ),
      )}

      <FormError>{error}</FormError>

      <div className={styles.formAcciones}>
        <Button type="submit" loading={enviando}>
          {item ? "Guardar cambios" : "Crear"}
        </Button>
        {item ? (
          <Button type="button" variant="ghost" loading={borrando} onClick={onBorrar}>
            {entidad === "videos" ? "Despublicar" : "Borrar"}
          </Button>
        ) : null}
      </div>
    </form>
  );
}
