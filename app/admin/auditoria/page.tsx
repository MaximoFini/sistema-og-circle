import { Suspense } from "react";
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

// VGRP-36 guardaba siempre { nivel }; VGRP-40 (actualizar_config) guarda el
// objeto completo de precios o de flags — sin un campo `nivel` en común. En
// vez de una función por `accion`, esta resume CUALQUIER objeto plano como
// "clave: valor, clave: valor", con el caso de `nivel` como atajo (ya
// probado en producción, se sigue mostrando igual que antes).
function resumirCambio(valor: Json | null): string {
  if (!valor || typeof valor !== "object" || Array.isArray(valor)) return "—";

  const obj = valor as Record<string, Json | undefined>;
  if (typeof obj.nivel === "string") return obj.nivel;

  const entradas = Object.entries(obj).filter(([, v]) => v !== undefined);
  if (entradas.length === 0) return "—";
  return entradas.map(([k, v]) => `${k}: ${JSON.stringify(v)}`).join(", ");
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

async function ResultadosAuditoria({
  actor,
  desde,
  hasta,
  cursor,
}: {
  actor?: string;
  desde?: string;
  hasta?: string;
  cursor?: string;
}) {
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
    <>
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
                <strong>{resumirCambio(f.valorAnterior)}</strong> →{" "}
                <strong>{resumirCambio(f.valorNuevo)}</strong>
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
    </>
  );
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

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Auditoría</h1>
      <p className={styles.lede}>
        Registro inmutable de toda acción de admin, de más reciente a más antigua.
      </p>

      <AuditoriaFiltros actor={actor} desde={desde} hasta={hasta} />

      <Suspense fallback={<p className={styles.vacio}>Cargando auditoría…</p>}>
        <ResultadosAuditoria actor={actor} desde={desde} hasta={hasta} cursor={cursor} />
      </Suspense>
    </div>
  );
}
