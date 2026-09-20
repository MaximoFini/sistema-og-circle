import { Suspense } from "react";
import { z } from "zod";
import { TextLink } from "@/components/ui";
import { listarPagos } from "@/lib/data/admin/pagos";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../admin.module.css";
import { PagosFiltros } from "./PagosFiltros";

// VGRP-37 — Ledger de pagos. Server Component: consulta `listarPagos` por
// service role (bypassa RLS; la barrera de autorización es el rol de la capa de
// ruta — middleware + layout). Filtro por estado + rango de fechas + búsqueda
// por `proveedor_ref`. Los pagos `approved` cuyo nivel NO quedó reflejado en el
// perfil se resaltan con el badge "sin aplicar" — el admin no filtra para
// encontrarlos, los ve de una. SÓLO LECTURA: no hay forma de editar ni borrar.
//
// Los filtros van por querystring y se validan con Zod. Si son inválidos, la
// página NO consulta la base y muestra "filtro inválido" (design.md §"Notas de
// traceabilidad": en un Server Component el "400" del AC se traduce a eso).

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  estado: z.string().trim().min(1).max(50).optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  ref: z.string().trim().min(1).max(200).optional(),
  cursor: z.string().min(1).max(500).optional(),
});

function fecha(iso: string): string {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function monto(ars: number): string {
  return ars.toLocaleString("es-AR", {
    style: "currency",
    currency: "ARS",
    maximumFractionDigits: 0,
  });
}

function construirQuery(
  base: { estado?: string; desde?: string; hasta?: string; ref?: string },
  cursor?: string,
): string {
  const params = new URLSearchParams();
  if (base.estado) params.set("estado", base.estado);
  if (base.desde) params.set("desde", base.desde);
  if (base.hasta) params.set("hasta", base.hasta);
  if (base.ref) params.set("ref", base.ref);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/admin/pagos?${qs}` : "/admin/pagos";
}

async function ResultadosPagos({
  estado,
  desde,
  hasta,
  proveedorRef,
  cursor,
}: {
  estado?: string;
  desde?: string;
  hasta?: string;
  // NUNCA nombrar esto `ref`: es una prop reservada de React (referencias a
  // elementos/componentes) — pasarla así a un Server Component tira "Refs
  // cannot be used in Server Components, nor passed to Client Components" en
  // vez de llegar como un string común. Bug real encontrado corriendo
  // e2e/admin-reprocesar-pago.spec.ts (VGRP-48): la página entera crasheaba
  // (500) al filtrar por referencia de pago, justo el único caso de uso real
  // de este filtro.
  proveedorRef?: string;
  cursor?: string;
}) {
  const admin = createServiceRoleClient();
  const { pagos, nextCursor, totalSinAplicar } = await listarPagos(admin, {
    estado,
    desde: desde ? `${desde}T00:00:00.000Z` : undefined,
    hasta: hasta ? `${hasta}T23:59:59.999Z` : undefined,
    proveedorRef,
    limit: 20,
    cursor,
  });

  return (
    <>
      {/* El total de "sin aplicar" depende de la misma consulta que la lista
          (VGRP-54 punto 7: se calcula una sola vez, sin cursor) — por eso el
          lede vive ACÁ adentro y no junto al <h1>, a diferencia de
          auditoria/usuarios (lede estático, sin datos). PagosFiltros también
          queda adentro (a diferencia de esas dos páginas, donde sí sale
          inmediato): sacarlo de acá para que pinte antes que el lede
          invertiría el orden visual actual (filtros antes que el lede, hoy
          es al revés) o exigiría un segundo <Suspense> propio que dispare
          una consulta aparte sólo para el conteo — ninguna de las dos vale
          la pena por lo poco que tarda hoy este query. */}
      <p className={styles.lede}>
        Ledger completo. Los aprobados que no quedaron aplicados están marcados{" "}
        <span className={styles.badgeSinAplicar}>sin aplicar</span>.
        {totalSinAplicar !== null && totalSinAplicar > 0
          ? ` Hay ${totalSinAplicar} en total.`
          : null}
      </p>

      <PagosFiltros estado={estado} desde={desde} hasta={hasta} proveedorRef={proveedorRef} />

      {pagos.length === 0 ? (
        <p className={styles.vacio}>No hay pagos para este filtro.</p>
      ) : (
        <div className={styles.lista}>
          {pagos.map((p) => (
            <TextLink key={p.id} href={`/admin/pagos/${p.id}`} className={styles.userRow}>
              <span className={styles.userEmail}>{p.user_email}</span>
              <span className={styles.pagoDatos}>
                {p.nivel_comprado} · {monto(p.monto_ars)}
              </span>
              <span className={styles.badgeFila}>
                <span className={styles.badgeEstado}>{p.estado}</span>
                {p.sin_aplicar ? <span className={styles.badgeSinAplicar}>sin aplicar</span> : null}
              </span>
              <span className={styles.filaMeta}>{p.proveedor_ref}</span>
              <span className={styles.userAlta}>{fecha(p.created_at)}</span>
            </TextLink>
          ))}
        </div>
      )}

      {nextCursor ? (
        <TextLink
          href={construirQuery({ estado, desde, hasta, ref: proveedorRef }, nextCursor)}
          className={styles.cargarMas}
        >
          Cargar más
        </TextLink>
      ) : null}
    </>
  );
}

export default async function PagosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = searchSchema.safeParse({
    estado: typeof raw.estado === "string" ? raw.estado : undefined,
    desde: typeof raw.desde === "string" ? raw.desde : undefined,
    hasta: typeof raw.hasta === "string" ? raw.hasta : undefined,
    ref: typeof raw.ref === "string" ? raw.ref : undefined,
    cursor: typeof raw.cursor === "string" ? raw.cursor : undefined,
  });

  if (!parsed.success) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Pagos</h1>
        <PagosFiltros />
        <p className={styles.avisoFiltro}>
          Filtro inválido. Revisá los parámetros y volvé a intentar.
        </p>
      </div>
    );
  }

  const { estado, desde, hasta, ref, cursor } = parsed.data;

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Pagos</h1>

      <Suspense fallback={<p className={styles.vacio}>Cargando pagos…</p>}>
        <ResultadosPagos
          estado={estado}
          desde={desde}
          hasta={hasta}
          proveedorRef={ref}
          cursor={cursor}
        />
      </Suspense>
    </div>
  );
}
