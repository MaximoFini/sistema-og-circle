"use client";

// VGRP-38 — form de crear/editar, genérico por entidad. Los 4 CRUDs comparten
// exactamente el mismo mecanismo (fetch a /api/admin/contenido/:entidad[/:id]
// + manejo de error) — lo único que cambia entre entidades es QUÉ CAMPOS se
// muestran, así que eso es la única parte "hardcodeada por entidad" (CAMPOS
// de abajo), no el form en sí.

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, Checkbox, FormError } from "@/components/ui";
import { tieneFoto } from "@/lib/fotos/constantes";
import { videoProvider } from "@/lib/video/provider";
import styles from "../../admin.module.css";
import { type CambioFoto, CampoFoto } from "./CampoFoto";

// VGRP-59/60 (Bloque 13 — plan único): `nivel_requerido` se dropeó de
// agentes/videos/servicios_financieros (ya no tiene sentido distinguir nivel
// por fila con un solo plan) — el tipo "nivel" de campo desapareció con él.

type TipoCampo = "text" | "textarea" | "number" | "checkbox" | "stage";

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
    // Sin campo "orden": los videos se reordenan arrastrando en el listado.
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
    { name: "orden", label: "Orden", tipo: "number" },
    { name: "activo", label: "Activo", tipo: "checkbox" },
  ],
};

function valorPorDefecto(campo: CampoConfig): unknown {
  if (campo.tipo === "checkbox") return campo.name !== "publicado";
  if (campo.tipo === "number") return 0;
  if (campo.tipo === "stage") return 1;
  return "";
}

export interface ContenidoFormProps {
  entidad: string;
  /** Presente = editar; ausente = crear. */
  item?: Record<string, unknown> & { id: string };
  /** Agentes / profesionales: URL de la foto guardada hoy (null = sin foto). */
  fotoActualUrl?: string | null;
}

interface RespuestaError {
  error?: string;
  fieldErrors?: Record<string, string[]>;
}

/**
 * Foto de perfil — segundo paso, DESPUÉS de guardar el registro (design.md
 * §Key flows). Devuelve el mensaje de error, o null si salió bien.
 */
async function aplicarFoto(entidad: string, id: string, cambio: CambioFoto) {
  if (cambio.tipo === "sin-cambios") return null;
  const url = `/api/admin/contenido/${entidad}/${id}/foto`;
  try {
    let res: Response;
    if (cambio.tipo === "nueva") {
      const form = new FormData();
      form.set("foto", cambio.blob, "foto.webp");
      res = await fetch(url, { method: "PUT", body: form });
    } else {
      res = await fetch(url, { method: "DELETE" });
    }
    if (res.ok) return null;
    const data = (await res.json().catch(() => ({}))) as RespuestaError;
    return data.error ?? "No se pudo guardar la foto.";
  } catch {
    return "No se pudo conectar.";
  }
}

export function ContenidoForm({ entidad, item, fotoActualUrl = null }: ContenidoFormProps) {
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
  const conFoto = tieneFoto(entidad);
  const [cambioFoto, setCambioFoto] = useState<CambioFoto>({ tipo: "sin-cambios" });
  // Alta cuyo registro se guardó pero la foto no: el próximo "Guardar" edita
  // ESE registro (no crea otro) y reintenta la foto, sin salir de la página
  // — el recorte sólo existe en memoria de este form.
  const [idCreado, setIdCreado] = useState<string | null>(null);

  const urlBase = `/api/admin/contenido/${entidad}`;
  const idActual = item?.id ?? idCreado;
  const url = idActual ? `${urlBase}/${idActual}` : urlBase;

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setErroresCampo({});

    try {
      const res = await fetch(url, {
        method: idActual ? "PATCH" : "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(valores),
      });

      if (res.ok) {
        const guardado = (await res.json().catch(() => ({}))) as { id?: string };
        const id = idActual ?? guardado.id;
        if (conFoto && id) {
          const errorFoto = await aplicarFoto(entidad, id, cambioFoto);
          if (errorFoto) {
            setIdCreado(id);
            setError(
              `El ítem se guardó, pero la foto no: ${errorFoto} Volvé a guardar para reintentar.`,
            );
            return;
          }
        }
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
      {conFoto ? (
        <CampoFoto
          nombre={String(valores.nombre ?? "")}
          fotoActualUrl={fotoActualUrl}
          cambio={cambioFoto}
          onCambio={setCambioFoto}
          disabled={enviando}
        />
      ) : null}
      {campos.map((campo) =>
        campo.tipo === "checkbox" ? (
          // Caso aparte: el Checkbox del sistema trae su propia etiqueta
          // asociada — repetir el <span className={formLabel}> de arriba
          // duplicaría el texto.
          <Checkbox
            key={campo.name}
            label={campo.label}
            checked={Boolean(valores[campo.name])}
            onChange={(e) => setValores((v) => ({ ...v, [campo.name]: e.target.checked }))}
          />
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
          {idActual ? "Guardar cambios" : "Crear"}
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
