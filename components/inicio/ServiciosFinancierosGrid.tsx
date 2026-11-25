"use client";

// VGRP-32 — mismo patrón que AgentesGrid.tsx, pero acá el gating es de la FILA
// COMPLETA (título siempre visible, descripción es el "secreto" — ver
// lib/data/servicios.ts). <ContenidoBloqueado> envuelve la descripción, no la card
// entera: el título nunca desaparece sin explicación (regla dura del PRD §6).

import { useEffect, useState } from "react";
import { ContenidoBloqueado } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { ContactoDirectorio } from "./ContactoDirectorio";
import styles from "./inicio.module.css";

interface ServicioRespuesta {
  id: string;
  publicMeta: { titulo: string; fotoUrl: string | null };
  descripcion: string | null;
  contacto: string | null;
}

export function ServiciosFinancierosGrid() {
  const [servicios, setServicios] = useState<ServicioRespuesta[] | null>(null);

  useEffect(() => {
    let cancelado = false;

    fetch("/api/servicios-financieros")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { servicios: ServicioRespuesta[] } | null) => {
        if (cancelado || !data) return;
        setServicios(data.servicios);
      })
      .catch(() => {
        // Fallo silencioso: mismo criterio que AgentesGrid.
      });

    return () => {
      cancelado = true;
    };
  }, []);

  if (!servicios) {
    return <p className={styles.estado}>Cargando servicios…</p>;
  }

  if (servicios.length === 0) {
    return <p className={styles.estado}>Todavía no hay servicios cargados.</p>;
  }

  return (
    <div className={styles.agentesGrid}>
      {servicios.map((servicio) => (
        <div key={servicio.id} className={styles.agenteCard}>
          {/* Con foto: avatar + título en la cabecera (<span>, igual que los
              profesionales). Sin foto: el título solo, como antes — no se inventan
              iniciales para un servicio que no cargó logo. */}
          {servicio.publicMeta.fotoUrl ? (
            <span className={styles.agenteCabecera}>
              <Avatar nombre={servicio.publicMeta.titulo} fotoUrl={servicio.publicMeta.fotoUrl} />
              <strong className={styles.servicioTitulo}>{servicio.publicMeta.titulo}</strong>
            </span>
          ) : (
            <strong className={styles.servicioTitulo}>{servicio.publicMeta.titulo}</strong>
          )}
          <ContenidoBloqueado bloqueado={servicio.descripcion === null}>
            <p className={styles.textoTarjeta}>{servicio.descripcion}</p>
          </ContenidoBloqueado>
          {servicio.contacto ? (
            <ContactoDirectorio contacto={servicio.contacto} nombre={servicio.publicMeta.titulo} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
