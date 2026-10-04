import { Suspense } from "react";
import { z } from "zod";
import { TextLink } from "@/components/ui";
import { listarAuditLog } from "@/lib/data/admin/audit-log";
import { escaparLike } from "@/lib/data/admin/keyset";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../admin.module.css";
import { normalizarParams, rangoDia } from "../searchParams";
import { AuditoriaFiltros } from "./AuditoriaFiltros";
import { type ContextoAudit, describirAccion } from "./describir";

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

interface PagoConDueño {
  id: string;
  monto_ars: number;
  profiles: { email: string } | null;
}

/** Resuelve, en dos consultas en paralelo (no una por fila), a quién
 *  pertenecen los perfiles y pagos que referencian las filas visibles, para
 *  nombrarlos en el texto. El email del dueño de un pago viene embebido por la
 *  FK `pagos.user_id -> profiles` (mismo patrón que `listarAuditLog`). */
async function resolverContexto(
  admin: ReturnType<typeof createServiceRoleClient>,
  filas: { entidad: string; entidadId: string | null }[],
): Promise<ContextoAudit> {
  const ids = (entidad: string) => [
    ...new Set(
      filas.filter((f) => f.entidad === entidad && f.entidadId).map((f) => f.entidadId as string),
    ),
  ];
  const pagoIds = ids("pagos");
  const perfilIds = ids("profiles");

  const [pagosRes, perfilesRes] = await Promise.all([
    pagoIds.length
      ? admin
          .from("pagos")
          .select("id, monto_ars, profiles:user_id(email)")
          .in("id", pagoIds)
          .returns<PagoConDueño[]>()
      : { data: [] as PagoConDueño[] },
    perfilIds.length
      ? admin.from("profiles").select("id, email").in("id", perfilIds)
      : { data: [] },
  ]);

  return {
    emails: new Map((perfilesRes.data ?? []).map((p) => [p.id, p.email])),
    pagos: new Map(
      (pagosRes.data ?? []).map((p) => [
        p.id,
        { email: p.profiles?.email ?? null, monto: p.monto_ars },
      ]),
    ),
  };
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

  const { filas: crudas, nextCursor } =
    actor && (actorIds?.length ?? 0) === 0
      ? { filas: [], nextCursor: null }
      : await listarAuditLog(admin, {
          actorIds,
          ...rangoDia(desde, hasta),
          limit: 20,
          cursor,
        });

  const contexto = await resolverContexto(admin, crudas);
  const filas = crudas.map((f) => ({
    ...f,
    descripcion: describirAccion(f, contexto),
  }));

  return (
    <>
      {actoresResueltos.length > 1 ? (
        <p className={styles.vacio}>
          Mostrando {actoresResueltos.length} usuarios que coinciden con “{actor}”:{" "}
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
              <span className={styles.filaAccion}>{f.descripcion.titulo}</span>
              <span className={styles.filaCambio}>
                {f.descripcion.detalle.map((linea, i) => (
                  <span key={i}>{linea}</span>
                ))}
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
  const parsed = searchSchema.safeParse(normalizarParams(raw));

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
