"use client";

// VGRP-32 — mismo patrón que AgentesGrid.tsx: Client Component con fetch de cliente a
// un Route Handler dinámico. Sin gating por nivel (profesionales no lo tiene, VGRP-38)
// — no hay nada que envolver en <ContenidoBloqueado>, el contacto se muestra directo
// una vez resuelto.

import { Avatar } from "@/components/ui/Avatar";
import { pedirJson, useDatosCacheados } from "@/lib/cliente/cache-datos";
import { ContactoDirectorio } from "./ContactoDirectorio";
import { DATOS_INICIO } from "./datos-inicio";
import styles from "./inicio.module.css";

interface ProfesionalRespuesta {
  id: string;
  publicMeta: {
    nombre: string;
    rubro: string;
    descripcion: string | null;
    fotoUrl: string | null;
  };
  contacto: string | null;
}

export function ProfesionalesGrid() {
  // Caché de cliente: mismo criterio que AgentesGrid (fallo silencioso incluido).
  const profesionales = useDatosCacheados(DATOS_INICIO.profesionales, () =>
    pedirJson<{ profesionales: ProfesionalRespuesta[] }>(DATOS_INICIO.profesionales),
  ).datos?.profesionales;

  if (!profesionales) {
    return <p className={styles.estado}>Cargando profesionales…</p>;
  }

  if (profesionales.length === 0) {
    return <p className={styles.estado}>Todavía no hay profesionales cargados.</p>;
  }

  return (
    <div className={styles.agentesGrid}>
      {profesionales.map((prof) => (
        <div key={prof.id} className={styles.agenteCard}>
          {/* <span>, no <div>: e2e/gating-contenido.spec.ts toma el ÚLTIMO div que
              contiene el nombre y espera que sea la tarjeta entera (con el CTA). */}
          <span className={styles.agenteCabecera}>
            <Avatar nombre={prof.publicMeta.nombre} fotoUrl={prof.publicMeta.fotoUrl} />
            <span className={styles.agenteNombre}>
              <strong>{prof.publicMeta.nombre}</strong>
              <span className={styles.meta}>{prof.publicMeta.rubro}</span>
            </span>
          </span>
          {prof.publicMeta.descripcion ? (
            <p className={styles.textoTarjeta}>{prof.publicMeta.descripcion}</p>
          ) : null}
          {prof.contacto ? (
            <ContactoDirectorio contacto={prof.contacto} nombre={prof.publicMeta.nombre} />
          ) : null}
        </div>
      ))}
    </div>
  );
}
