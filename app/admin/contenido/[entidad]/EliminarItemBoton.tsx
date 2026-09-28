"use client";

// Borrado real por ítem, desde el listado — sin pasar por la pantalla de
// edición. Mismo mecanismo que el botón "Eliminar" de ContenidoForm.tsx
// (fetch DELETE a /api/admin/contenido/:entidad/:id + confirm nativo, no hay
// primitiva de Dialog en el repo — ver admin.module.css "Config: precios y
// flags"), pero vive acá porque el listado es un Server Component y esto es
// la única parte de cada fila que necesita ser Client Component.

import { useRouter } from "next/navigation";
import { useState } from "react";
import styles from "../../admin.module.css";

export interface EliminarItemBotonProps {
  entidad: string;
  id: string;
  nombre: string;
  /** Aviso adicional en la confirmación — usado por `videos` para aclarar el
   *  atajo de "Publicado" en vez de borrar (VGRP-38 US-5: profiles.progreso
   *  referencia videos por id). */
  avisoExtra?: string;
}

export function EliminarItemBoton({ entidad, id, nombre, avisoExtra }: EliminarItemBotonProps) {
  const router = useRouter();
  const [borrando, setBorrando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onClick() {
    const aviso = `¿Eliminar "${nombre}"? Esta acción no se puede deshacer.${
      avisoExtra ? ` ${avisoExtra}` : ""
    }`;
    if (!window.confirm(aviso)) return;

    setBorrando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/contenido/${entidad}/${id}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo eliminar.");
      setBorrando(false);
    } catch {
      setError("No se pudo conectar. Reintentá.");
      setBorrando(false);
    }
  }

  return (
    <span className={styles.itemAcciones}>
      <button
        type="button"
        className={styles.itemBorrar}
        onClick={onClick}
        disabled={borrando}
        aria-busy={borrando || undefined}
      >
        {borrando ? "Eliminando…" : "Eliminar"}
      </button>
      {error ? <span className={styles.itemError}>{error}</span> : null}
    </span>
  );
}
