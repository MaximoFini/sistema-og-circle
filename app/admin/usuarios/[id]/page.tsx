import { notFound } from "next/navigation";
import { obtenerUsuario } from "@/lib/data/admin/usuarios";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../../admin.module.css";
import { estadoLabel, nivelLabel, origenPago } from "../../pagos/estados";
import { CambiarNivelForm } from "./CambiarNivelForm";

// VGRP-36 — Ficha de un usuario. Server Component: datos, nivel activo,
// `progreso` (videos vistos, por título), historial de pagos (mini-ledger) e
// historial de overrides manuales. `:id` sin match -> `notFound()` (US-3: 404).
// El cambio de nivel vive en `CambiarNivelForm` (Client Component).

export const dynamic = "force-dynamic";

function monto(ars: number): string {
  return ars.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

// `progreso` es jsonb libre; hoy la única forma que escribe la app es
// `{ videosVistos: uuid[] }` (components/video/_actions.ts).
function leerVideosVistos(progreso: unknown): string[] {
  if (progreso && typeof progreso === "object" && "videosVistos" in progreso) {
    const v = (progreso as { videosVistos: unknown }).videosVistos;
    if (Array.isArray(v)) return v.filter((x): x is string => typeof x === "string");
  }
  return [];
}

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default async function UsuarioDetallePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const admin = createServiceRoleClient();
  const detalle = await obtenerUsuario(admin, id);
  if (!detalle) notFound();

  const { perfil, nivelActivo, pagos, overrides, videos } = detalle;
  const vistos = new Set(leerVideosVistos(perfil.progreso));
  const totalPublicados = videos.filter((v) => v.publicado).length;
  // En el orden del catálogo (stage, orden), no en el orden en que los vio.
  const videosVistos = videos.filter((v) => vistos.has(v.id));
  // El conteo compara contra lo publicado; los no publicados se listan aparte.
  const vistosPublicados = videosVistos.filter((v) => v.publicado).length;
  const titulosVistos = videosVistos.map((v) =>
    v.publicado ? v.titulo : `${v.titulo} (no publicado)`,
  );
  const eliminados = vistos.size - videosVistos.length;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>{perfil.email}</h1>
      <p className={styles.lede}>
        Nivel vigente:{" "}
        <span className={`${styles.nivelPill} ${styles.nivelPillActivo}`}>
          {nivelLabel(nivelActivo)}
        </span>
      </p>

      <div className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>Datos</h2>
        <dl className={styles.dl}>
          <dt>ID</dt>
          <dd>{perfil.id}</dd>
          <dt>Nombre</dt>
          <dd>{perfil.nombre ?? "—"}</dd>
          <dt>Teléfono</dt>
          <dd>{perfil.telefono ?? "—"}</dd>
          <dt>Nivel en el perfil</dt>
          <dd>{nivelLabel(perfil.nivel)}</dd>
          <dt>Rol</dt>
          <dd>{perfil.rol}</dd>
          <dt>Alta</dt>
          <dd>{fecha(perfil.created_at)}</dd>
          <dt>Términos</dt>
          <dd>
            {perfil.terminos_aceptados_at
              ? `${perfil.terminos_version ?? "?"} · ${fecha(perfil.terminos_aceptados_at)}`
              : "sin aceptar"}
          </dd>
        </dl>
      </div>

      <div className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>Progreso</h2>
        {vistos.size === 0 ? (
          <p className={styles.vacio}>Todavía no vio ningún video.</p>
        ) : (
          <dl className={styles.dl}>
            <dt>Videos vistos</dt>
            <dd>
              {vistosPublicados} de {totalPublicados}
            </dd>
            <dt>Cuáles</dt>
            <dd>
              {titulosVistos.join(" · ")}
              {eliminados > 0
                ? `${titulosVistos.length > 0 ? " · " : ""}${eliminados} video${eliminados === 1 ? "" : "s"} que ya no existe${eliminados === 1 ? "" : "n"}`
                : null}
            </dd>
          </dl>
        )}
      </div>

      <div className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>Pagos ({pagos.length})</h2>
        {pagos.length === 0 ? (
          <p className={styles.vacio}>Sin pagos registrados.</p>
        ) : (
          <div className={styles.lista}>
            {pagos.map((p) => (
              <div key={p.id} className={styles.userRow}>
                <span className={styles.userEmail}>
                  {nivelLabel(p.nivel_comprado)} · {monto(p.monto_ars)} · {estadoLabel(p.estado)}
                </span>
                <span className={styles.filaMeta}>{origenPago(p)}</span>
                <span className={styles.userAlta}>{fecha(p.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>Cambios manuales de nivel ({overrides.length})</h2>
        {overrides.length === 0 ? (
          <p className={styles.vacio}>Sin cambios manuales.</p>
        ) : (
          <div className={styles.lista}>
            {overrides.map((o) => (
              <div key={o.id} className={styles.userRow}>
                <span className={styles.userEmail}>{o.nivel}</span>
                <span className={styles.filaMeta}>{o.motivo}</span>
                <span className={styles.userAlta}>{fecha(o.created_at)}</span>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className={styles.seccion}>
        <h2 className={styles.seccionTitulo}>Cambiar nivel</h2>
        <CambiarNivelForm userId={perfil.id} nivelActual={nivelActivo} />
      </div>
    </div>
  );
}
