import { z } from "zod";
import { TextLink } from "@/components/ui";
import { listarUsuarios } from "@/lib/data/admin/usuarios";
import { Constants } from "@/lib/database.types";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../admin.module.css";
import { UsuariosFiltros } from "./UsuariosFiltros";

// VGRP-36 — Listado de usuarios. Server Component: consulta `listarUsuarios`
// por service role (bypassa RLS; la barrera de autorización es el rol de la
// capa de ruta — middleware + layout). Búsqueda por email parcial + filtro por
// nivel + paginación keyset ("Cargar más"). Mobile-first: filas apiladas, no
// tabla.
//
// Los filtros van por querystring y se validan con Zod. Si son inválidos, la
// página NO consulta la base y muestra "filtro inválido" (design.md §"Notas de
// traceabilidad": en un Server Component el "400" del AC se traduce a eso).

export const dynamic = "force-dynamic";

const searchSchema = z.object({
  q: z.string().trim().min(1).max(200).optional(),
  nivel: z.enum(Constants.public.Enums.nivel_acceso).optional(),
  cursor: z.string().min(1).max(500).optional(),
});

function formatearFecha(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
  });
}

function construirQuery(base: { q?: string; nivel?: string }, cursor?: string): string {
  const params = new URLSearchParams();
  if (base.q) params.set("q", base.q);
  if (base.nivel) params.set("nivel", base.nivel);
  if (cursor) params.set("cursor", cursor);
  const qs = params.toString();
  return qs ? `/admin/usuarios?${qs}` : "/admin/usuarios";
}

export default async function UsuariosPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const raw = await searchParams;
  const parsed = searchSchema.safeParse({
    q: typeof raw.q === "string" ? raw.q : undefined,
    nivel: typeof raw.nivel === "string" ? raw.nivel : undefined,
    cursor: typeof raw.cursor === "string" ? raw.cursor : undefined,
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

  const { q, nivel, cursor } = parsed.data;
  const admin = createServiceRoleClient();
  const { usuarios, nextCursor } = await listarUsuarios(admin, { q, nivel, limit: 20, cursor });

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Usuarios</h1>
      <p className={styles.lede}>
        Buscá por email, abrí la ficha y activá o cambiá el nivel a mano.
      </p>

      <UsuariosFiltros q={q} nivel={nivel} />

      {usuarios.length === 0 ? (
        <p className={styles.vacio}>No hay usuarios para este filtro.</p>
      ) : (
        <div className={styles.lista}>
          {usuarios.map((u) => (
            <TextLink key={u.id} href={`/admin/usuarios/${u.id}`} className={styles.userRow}>
              <span className={styles.userEmail}>{u.email}</span>
              <span className={styles.nivelPill}>{u.nivel}</span>
              <span className={styles.userAlta}>{formatearFecha(u.created_at)}</span>
            </TextLink>
          ))}
        </div>
      )}

      {nextCursor ? (
        <TextLink href={construirQuery({ q, nivel }, nextCursor)} className={styles.cargarMas}>
          Cargar más
        </TextLink>
      ) : null}
    </div>
  );
}
