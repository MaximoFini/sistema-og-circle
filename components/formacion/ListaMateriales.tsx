"use client";

// VGRP-88 — filas de "Materiales adicionales" con el botón Descargar. Client Component: lleva
// el estado de "Ver todos" y el de cada descarga (cargando / error en la fila).
//
// La descarga pide una URL firmada a la Server Action `descargarMaterial` (que verifica el
// plan) y navega a ella: Storage responde con `Content-Disposition: attachment`, así que el
// navegador descarga sin salir de la página. Sin plan (`bloqueado`) los botones quedan
// deshabilitados, y aunque alguien los habilite a mano la acción igual lo rechaza.

import { useState } from "react";
import { descargarMaterial } from "@/app/(app)/formacion/_actions";
import { Button } from "@/components/ui/Button";
import { Icon } from "@/components/ui/Icon";
import type { MaterialItem } from "@/lib/materiales/tipos";
import styles from "./materiales.module.css";
import { metaMaterial, vistaLista } from "./materialesVisibles";

type EstadoFila = { tipo: "cargando" } | { tipo: "error"; mensaje: string };

export function ListaMateriales({
  materiales,
  bloqueado = false,
}: {
  materiales: MaterialItem[];
  bloqueado?: boolean;
}) {
  const [expandido, setExpandido] = useState(false);
  const [estados, setEstados] = useState<Record<string, EstadoFila>>({});
  const { visibles, botonExpandir } = vistaLista(materiales, expandido);

  function ponerEstado(id: string, estado: EstadoFila | null) {
    setEstados((prev) => {
      const { [id]: _, ...resto } = prev;
      return estado ? { ...resto, [id]: estado } : resto;
    });
  }

  async function descargar(id: string) {
    ponerEstado(id, { tipo: "cargando" });
    try {
      const res = await descargarMaterial(id);
      if (!res.ok) {
        ponerEstado(id, { tipo: "error", mensaje: res.error });
        return;
      }
      ponerEstado(id, null);
      window.location.assign(res.url);
    } catch {
      ponerEstado(id, {
        tipo: "error",
        mensaje: "No pudimos generar la descarga. Probá de nuevo.",
      });
    }
  }

  return (
    <>
      <ul className={styles.lista}>
        {visibles.map((material) => {
          const estado = estados[material.id];
          return (
            <li key={material.id} className={styles.fila}>
              <span className={styles.icono} aria-hidden="true">
                <Icon name="documento" size={20} />
              </span>
              <div className={styles.texto}>
                <p className={styles.titulo}>{material.titulo}</p>
                {material.descripcion ? (
                  <p className={styles.descripcion}>{material.descripcion}</p>
                ) : null}
                <p className={styles.meta}>{metaMaterial(material)}</p>
                {estado?.tipo === "error" ? (
                  <p className={styles.error} role="alert">
                    {estado.mensaje}
                  </p>
                ) : null}
              </div>
              <Button
                variant="ghost"
                size="sm"
                className={styles.accion}
                disabled={bloqueado}
                loading={estado?.tipo === "cargando"}
                onClick={bloqueado ? undefined : () => descargar(material.id)}
                aria-label={`Descargar ${material.titulo}`}
              >
                <Icon name="descargar" size={16} />
                Descargar
              </Button>
            </li>
          );
        })}
      </ul>
      {botonExpandir ? (
        <Button
          variant="ghost"
          size="sm"
          className={styles.expandir}
          aria-expanded={expandido}
          onClick={() => setExpandido((v) => !v)}
        >
          {botonExpandir}
        </Button>
      ) : null}
    </>
  );
}
