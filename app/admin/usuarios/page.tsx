import { Suspense } from "react";
import { z } from "zod";
import { TextLink } from "@/components/ui";
import { listarUsuarios, ORDENES_USUARIOS, type OrdenUsuarios } from "@/lib/data/admin/usuarios";
import { Constants } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../admin.module.css";
import { nivelLabel } from "../pagos/estados";
import { UsuariosFiltros } from "./UsuariosFiltros";

// VGRP-36 — Listado de usuarios. Server Component: consulta `listarUsuarios`
// por service role (bypassa RLS; la barrera de autorización es el rol de la
// capa de ruta — middleware + layout). Búsqueda parcial por email, nombre o
// teléfono + filtros por nivel, rol, términos y fecha de alta + orden +
// paginación keyset ("Cargar más"). Mobile-first: filas apiladas, no
// tabla.
//
// Los filtros van por querystring y se validan con Zod. Si son inválidos, la
// página NO consulta la base y muestra "filtro inválido" (design.md §"Notas de
// traceabilidad": en un Server Component el "400" del AC se traduce a eso).

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  nivel: z.enum(Constants.public.Enums.nivel_acceso).optional(),
  rol: z.enum(Constants.public.Enums.rol_usuario).optional(),
  terminos: z.enum(["si", "no"]).optional(),
  desde: z.iso.date().optional(),
  hasta: z.iso.date().optional(),
  orden: z.enum(ORDENES_USUARIOS).optional(),
  cursor: z.string().min(1).max(500).optional(),
});

type Filtros = Omit<z.infer<typeof searchSchema>, "cursor">;

// El form nativo manda `campo=` cuando un input queda vacío o el select está
// en "Todos": eso es "sin filtro", no un valor inválido.
function param(v: string | string[] | undefined): string | undefined {
  return typeof v === "string" && v.trim() !== "" ? v : undefined;
}

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function construirQuery(base: Filtros, cursor?: string): string {
  const params = new URLSearchParams();
  for (const [k, v] of Object.entries(base)) if (v) params.set(k, v);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/admin/usuarios?${qs}` : "/admin/usuarios";
}

async function ResultadosUsuarios({ filtros, cursor }: { filtros: Filtros; cursor?: string }) {
  const admin = createServiceRoleClient();
  const { desde, hasta, ...resto } = filtros;
  const { usuarios, nextCursor } = await listarUsuarios(admin, {
    ...resto,
    desde: desde ? `${desde}T00:00:00.000Z` : undefined,
    hasta: hasta ? `${hasta}T23:59:59.999Z` : undefined,
    limit: 20,
    cursor,
  });

  return (
    <>
      {usuarios.length === 0 ? (
        <p className={styles.vacio}>No hay usuarios para este filtro.</p>
      ) : (
        <div className={styles.lista}>
          {usuarios.map((u) => (
            <TextLink key={u.id} href={`/admin/usuarios/${u.id}`} className={styles.userRow}>
              <span className={styles.userEmail}>{u.email}</span>
              <span className={styles.nivelPill}>{nivelLabel(u.nivel)}</span>
              <span className={styles.userAlta}>{formatearFecha(u.created_at)}</span>
            </TextLink>
          ))}
        </div>
      )}

      {nextCursor ? (
        <TextLink href={construirQuery(filtros, nextCursor)} className={styles.cargarMas}>
          Cargar más
        </TextLink>
      ) : null}
    </>
  );
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = searchSchema.safeParse({
    q: param(raw.q),
    nivel: param(raw.nivel),
    rol: param(raw.rol),
    terminos: param(raw.terminos),
    desde: param(raw.desde),
    hasta: param(raw.hasta),
    orden: param(raw.orden),
    cursor: param(raw.cursor),
  });

  if (!parsed.success) {
    return (
      <div className={styles.page}>
        <h1 className={styles.h1}>Usuarios</h1>
        <UsuariosFiltros />
        <p className={styles.avisoFiltro}>
          Filtro inválido. Revisá los parámetros y volvé a intentar.
        </p>
      </div>
    );
  }

  const { cursor, ...filtros } = parsed.data;
  // Sin `orden` explícito es "recientes"; se normaliza para que el cursor y la
  // consulta usen siempre el mismo orden.
  const orden: OrdenUsuarios = filtros.orden ?? "recientes";

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Usuarios</h1>
      <p className={styles.lede}>
        Buscá por email, nombre o teléfono, abrí la ficha y activá o cambiá el nivel a mano.
      </p>

      <UsuariosFiltros {...filtros} />

      <Suspense fallback={<p className={styles.vacio}>Cargando usuarios…</p>}>
        <ResultadosUsuarios filtros={{ ...filtros, orden }} cursor={cursor} />
      </Suspense>
    </div>
  );
}
