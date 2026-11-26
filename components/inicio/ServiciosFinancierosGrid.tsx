"use client";

// VGRP-32 — mismo patrón que AgentesGrid.tsx, pero acá el gating es de la FILA
// COMPLETA (título siempre visible, descripción es el "secreto" — ver
// lib/data/servicios.ts). <ContenidoBloqueado> envuelve la descripción, no la card
// entera: el título nunca desaparece sin explicación (regla dura del PRD §6).

import { ContenidoBloqueado } from "@/components/ui";
import { Avatar } from "@/components/ui/Avatar";
import { pedirJson, useDatosCacheados } from "@/lib/cliente/cache-datos";
import { ContactoDirectorio } from "./ContactoDirectorio";
import { DATOS_INICIO } from "./datos-inicio";
import styles from "./inicio.module.css";

interface ServicioRespuesta {
  id: string;
  publicMeta: { titulo: string; fotoUrl: string | null };
  descripcion: string | null;
  contacto: string | null;
}

export function ServiciosFinancierosGrid() {
  // Caché de cliente: mismo criterio que AgentesGrid (fallo silencioso incluido).
  const servicios = useDatosCacheados(DATOS_INICIO.servicios, () =>
    pedirJson<{ servicios: ServicioRespuesta[] }>(DATOS_INICIO.servicios),
  ).datos?.servicios;

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
