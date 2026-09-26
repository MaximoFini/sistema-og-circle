"use client";

// VGRP-30/38 (seguimiento) — directorio real de agentes de compra. Client Component
// con fetch de cliente a un Route Handler dinámico (/api/agentes) — mismo patrón que
// UserFooter/DashboardHeader (VGRP-27): el shell sigue estático, esto se resuelve
// después de hidratar.
//
// Reemplaza a AgentesDemo.tsx (VGRP-30, contenido de demostración temporal) ahora que
// VGRP-38 creó la tabla real `agentes` — el mecanismo de gating (ContenidoBloqueado +
// resolverSecreto()) es exactamente el mismo, sólo cambió la fuente de datos
// (lib/data/agentes.ts en vez de content/agentes-demo.ts).

import { useEffect, useState } from "react";
import { ContenidoBloqueado } from "@/components/ui";
import type { NivelAcceso } from "@/lib/auth/claims";
import { iniciales } from "./iniciales";
import styles from "./inicio.module.css";

interface AgenteRespuesta {
  id: string;
  publicMeta: { nombre: string; especialidad: string; nivelRequerido: NivelAcceso };
  contacto: string | null;
}

export function AgentesGrid() {
  const [agentes, setAgentes] = useState<AgenteRespuesta[] | null>(null);
  const [nivelActual, setNivelActual] = useState<NivelAcceso>("ninguno");

  useEffect(() => {
    let cancelado = false;

    fetch("/api/agentes")
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { agentes: AgenteRespuesta[]; nivelActual: NivelAcceso } | null) => {
        if (cancelado || !data) return;
        setAgentes(data.agentes);
        setNivelActual(data.nivelActual);
      })
      .catch(() => {
        // Fallo silencioso: la sección queda en su estado de carga vacío —
        // no es contenido crítico del render inicial (ver InicioShell, que
        // sigue estático sin esto).
      });

    return () => {
      cancelado = true;
    };
  }, []);

  if (!agentes) {
    return <p className={styles.estado}>Cargando agentes…</p>;
  }

  if (agentes.length === 0) {
    return <p className={styles.estado}>Todavía no hay agentes cargados.</p>;
  }

  return (
    <div className={styles.agentesGrid}>
      {agentes.map((agente) => (
        // publicMeta (nombre, especialidad) se muestra SIEMPRE, esté
        // bloqueado o no — requirements-vgrp30.md, US-3: sólo el `secret`
        // (acá, el contacto) queda detrás de <ContenidoBloqueado>. Bloquear
        // la card entera (como en un intento anterior) tapaba también el
        // nombre, que no tiene nada de secreto.
        <div key={agente.id} className={styles.agenteCard}>
          {/* <span>, no <div>: e2e/gating-contenido.spec.ts toma el ÚLTIMO div que
              contiene el nombre y espera que sea la tarjeta entera (con el CTA). */}
          <span className={styles.agenteCabecera}>
            <span className={styles.iniciales} aria-hidden="true">
              {iniciales(agente.publicMeta.nombre)}
            </span>
            <span className={styles.agenteNombre}>
              <strong>{agente.publicMeta.nombre}</strong>
              <span className={styles.meta}>{agente.publicMeta.especialidad}</span>
            </span>
          </span>
          <ContenidoBloqueado
            bloqueado={agente.contacto === null}
            nivelRequerido={agente.publicMeta.nivelRequerido}
            nivelActual={nivelActual}
          >
            <p className={styles.contacto}>{agente.contacto}</p>
          </ContenidoBloqueado>
        </div>
      ))}
    </div>
  );
}
