"use client";

// VGRP-32 — mismo patrón que AgentesGrid.tsx: Client Component con fetch de cliente a
// un Route Handler dinámico. Sin gating por nivel (profesionales no lo tiene, VGRP-38)
// — no hay nada que envolver en <ContenidoBloqueado>, el contacto se muestra directo
// una vez resuelto.

import { useEffect, useState } from "react";
import styles from "./inicio.module.css";

interface ProfesionalRespuesta {
  id: string;
  publicMeta: { nombre: string; rubro: string; descripcion: string | null };
  contacto: string | null;
}

export function ProfesionalesGrid() {
  const [profesionales, setProfesionales] = useState<ProfesionalRespuesta[] | null>(null);

  useEffect(() => {
    let cancelado = false;

    fetch("/api/profesionales")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { profesionales: ProfesionalRespuesta[] } | null) => {
        if (cancelado || !data) return;
        setProfesionales(data.profesionales);
      })
      .catch(() => {
        // Fallo silencioso: mismo criterio que AgentesGrid.
      });

    return () => {
      cancelado = true;
    };
  }, []);

  if (!profesionales) {
    return <p className={styles.descripcion}>Cargando profesionales…</p>;
  }

  if (profesionales.length === 0) {
    return <p className={styles.descripcion}>Todavía no hay profesionales cargados.</p>;
  }

  return (
    <div className={styles.agentesGrid}>
      {profesionales.map((prof) => (
        <div key={prof.id} className={styles.agenteCard}>
          <strong>{prof.publicMeta.nombre}</strong>
          <p className={styles.descripcion}>{prof.publicMeta.rubro}</p>
          {prof.publicMeta.descripcion ? (
            <p className={styles.descripcion}>{prof.publicMeta.descripcion}</p>
          ) : null}
          {prof.contacto ? <p className={styles.descripcion}>{prof.contacto}</p> : null}
        </div>
      ))}
    </div>
  );
}
