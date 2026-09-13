"use client";

// VGRP-32 — mismo patrón que AgentesGrid.tsx, pero acá el gating es de la FILA
// COMPLETA (título siempre visible, descripción es el "secreto" — ver
// lib/data/servicios.ts). <ContenidoBloqueado> envuelve la descripción, no la card
// entera: el título nunca desaparece sin explicación (regla dura del PRD §6).

import { useEffect, useState } from "react";
import { ContenidoBloqueado } from "@/components/ui";
import type { NivelAcceso } from "@/lib/auth/claims";
import styles from "./inicio.module.css";

interface ServicioRespuesta {
  id: string;
  publicMeta: { titulo: string; nivelRequerido: NivelAcceso };
  descripcion: string | null;
}

export function ServiciosFinancierosGrid() {
  const [servicios, setServicios] = useState<ServicioRespuesta[] | null>(null);
  const [nivelActual, setNivelActual] = useState<NivelAcceso>("ninguno");

  useEffect(() => {
    let cancelado = false;

    fetch("/api/servicios-financieros")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { servicios: ServicioRespuesta[]; nivelActual: NivelAcceso } | null) => {
        if (cancelado || !data) return;
        setServicios(data.servicios);
        setNivelActual(data.nivelActual);
      })
      .catch(() => {
        // Fallo silencioso: mismo criterio que AgentesGrid.
      });

    return () => {
      cancelado = true;
    };
  }, []);

  if (!servicios) {
    return <p className={styles.descripcion}>Cargando servicios…</p>;
  }

  if (servicios.length === 0) {
    return <p className={styles.descripcion}>Todavía no hay servicios cargados.</p>;
  }

  return (
    <div className={styles.agentesGrid}>
      {servicios.map((servicio) => (
        <div key={servicio.id} className={styles.agenteCard}>
          <strong>{servicio.publicMeta.titulo}</strong>
          <ContenidoBloqueado
            bloqueado={servicio.descripcion === null}
            nivelRequerido={servicio.publicMeta.nivelRequerido}
            nivelActual={nivelActual}
          >
            <p className={styles.descripcion}>{servicio.descripcion}</p>
          </ContenidoBloqueado>
        </div>
      ))}
    </div>
  );
}
