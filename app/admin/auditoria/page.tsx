import { z } from "zod";
import { TextLink } from "@/components/ui";
import { listarAuditLog } from "@/lib/data/admin/audit-log";
import type { Json } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../admin.module.css";
import { AuditoriaFiltros } from "./AuditoriaFiltros";

// VGRP-35 — Pantalla de auditoría. Server Component: consulta `listarAuditLog`
// por service role (bypassa RLS; la barrera de autorización es el rol de la
// capa de ruta — middleware + layout). SÓLO LECTURA: no ofrece editar ni
// borrar filas.
//
// Los filtros van por querystring y se validan con Zod. Si son inválidos, la
// página NO consulta la base y muestra "filtro inválido" — en un Server
// Component el "400" del AC se traduce a eso (design.md §"Notas de
// traceabilidad").

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  actor: z.string().trim().min(1).max(200).optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  cursor: z.string().min(1).max(500).optional(),
});

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function resumirNivel(valor: Json | null): string {
  if (valor && typeof valor === "object" && !Array.isArray(valor)) {
    const nivel = (valor as Record<string, Json | undefined>).nivel;
    if (typeof nivel === "string") return nivel;
  }
  return "—";
}

// Escapa los comodines de LIKE/ILIKE (`%`, `_`, `\`) para que el texto que
// tipea el admin se busque literal como substring, no como patrón.
function escaparLike(s: string): string {
  return s.replace(/[\\%_]/g, "\\$&");
}

function construirQuery(
  base: { actor?: string; desde?: string; hasta?: string },
  cursor?: string,
): string {
  const params = new URLSearchParams();
  if (base.actor) params.set("actor", base.actor);
  if (base.desde) params.set("desde", base.desde);
  if (base.hasta) params.set("hasta", base.hasta);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/admin/auditoria?${qs}` : "/admin/auditoria";
}

export default async function AuditoriaPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = searchSchema.safeParse({
    actor: typeof raw.actor === "string" ? raw.actor : undefined,
    desde: typeof raw.desde === "string" ? raw.desde : undefined,
    hasta: typeof raw.hasta === "string" ? raw.hasta : undefined,
    cursor: typeof raw.cursor === "string" ? raw.cursor : undefined,
  });

  if (!parsed.success) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Auditoría</h1>
        <AuditoriaFiltros />
        <p className={styles.avisoFiltro}>Filtro inválido. Revisá las fechas y volvé a intentar.</p>
      </div>
    );
  }

  const { actor, desde, hasta, cursor } = parsed.data;
  const admin = createServiceRoleClient();

  // El filtro por actor es una búsqueda parcial de email; se resuelve acá (la
  // página compone) a TODOS los actor_id que matchean — `listarAuditLog` filtra
  // con `in`. Si no matchea ninguno, se corta con lista vacía.
  let actorIds: string[] | undefined;
  let actoresResueltos: string[] = [];
  if (actor) {
    const { data: perfiles } = await admin
      .from("profiles")
      .select("id, email")
      .ilike("email", `%${escaparLike(actor)}%`)
      .order("email", { ascending: true })
      .limit(25);
    actorIds = (perfiles ?? []).map((p) => p.id);
    actoresResueltos = (perfiles ?? []).map((p) => p.email);
  }

  const { filas, nextCursor } =
    actor && (actorIds?.length ?? 0) === 0
      ? { filas: [], nextCursor: null }
      : await listarAuditLog(admin, {
          actorIds,
          desde: desde ? `${desde}T00:00:00.000Z` : undefined,
          hasta: hasta ? `${hasta}T23:59:59.999Z` : undefined,
          limit: 20,
          cursor,
        });

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Auditoría</h1>
      <p className={styles.lede}>
        Registro inmutable de toda acción de admin, de más reciente a más antigua.
      </p>

      <AuditoriaFiltros actor={actor} desde={desde} hasta={hasta} />

      {actoresResueltos.length > 1 ? (
        <p className={styles.vacio}>
          Mostrando {actoresResueltos.length} actores que coinciden con “{actor}”:{" "}
          {actoresResueltos.join(", ")}.
        </p>
      ) : null}

      {filas.length === 0 ? (
        <p className={styles.vacio}>No hay acciones registradas para este filtro.</p>
      ) : (
        <div className={styles.lista}>
          {filas.map((f) => (
            <div key={f.id} className={styles.fila}>
              <span className={styles.filaFecha}>{formatearFecha(f.createdAt)}</span>
              <span className={styles.filaActor}>{f.actorEmail ?? f.actorId ?? "—"}</span>
              <span className={styles.filaAccion}>
                {f.accion} · {f.entidad}
                {f.entidadId ? ` (${f.entidadId})` : ""}
              </span>
              <span className={styles.filaCambio}>
                <strong>{resumirNivel(f.valorAnterior)}</strong> →{" "}
                <strong>{resumirNivel(f.valorNuevo)}</strong>
              </span>
            </div>
          ))}
        </div>
      )}

      {nextCursor ? (
        <TextLink
          href={construirQuery({ actor, desde, hasta }, nextCursor)}
          className={styles.cargarMas}
        >
          Cargar más
        </TextLink>
      ) : null}
    </div>
  );
}
