import { notFound } from "next/navigation";
import { Suspense } from "react";
import { TextLink } from "@/components/ui";
import {
  campoVigencia,
  type Entidad,
  esEntidadValida,
  listarContenido,
} from "@/lib/data/admin/contenido";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../../admin.module.css";

// VGRP-38 — listado de una entidad de contenido. Server Component: lectura
// directa por service role (bypassa RLS; la barrera de autorización es el rol
// de la capa de ruta — middleware + layout), mismo criterio que
// app/admin/usuarios/page.tsx.

export const dynamic = "force-dynamic";

const TITULO: Record<string, string> = {
  agentes: "Agentes de compra",
  videos: "Videos",
  profesionales: "Profesionales",
  servicios_financieros: "Servicios financieros",
};

function subtitulo(entidad: string, item: Record<string, unknown>): string {
  if (entidad === "videos") return `Stage ${item.stage}`;
  if ("especialidad" in item) return String(item.especialidad ?? "");
  if ("rubro" in item) return String(item.rubro ?? "");
  return "";
}

function tituloItem(entidad: string, item: Record<string, unknown>): string {
  if (entidad === "videos" || entidad === "servicios_financieros") return String(item.titulo ?? "");
  return String(item.nombre ?? "");
}

async function ResultadosContenido({ entidad }: { entidad: Entidad }) {
  const admin = createServiceRoleClient();
  const items = await listarContenido(admin, entidad);
  const campo = campoVigencia(entidad);

  return (
    <>
      <p className={styles.lede}>{items.length} ítem(s), ordenados por "orden".</p>

      {/* VGRP-54 punto 4 — "+ Crear nuevo" no depende de `items`, pero queda
          adentro del mismo Suspense que el lede (que sí depende) para no
          invertir el orden visual actual (hoy el lede va antes del botón). */}
      <div className={styles.formAcciones}>
        <TextLink href={`/admin/contenido/${entidad}/nuevo`} className={`${styles.card}`}>
          + Crear nuevo
        </TextLink>
      </div>

      {items.length === 0 ? (
        <p className={styles.vacio}>Todavía no hay ítems cargados.</p>
      ) : (
        <ul className={styles.itemLista}>
          {items.map((item) => {
            const registro = item as Record<string, unknown>;
            const vigente = Boolean(registro[campo]);
            return (
              <li key={String(registro.id)}>
                <TextLink
                  href={`/admin/contenido/${entidad}/${registro.id}`}
                  className={`${styles.itemFila} ${vigente ? "" : styles.itemInactivo}`}
                >
                  <span className={styles.itemInfo}>
                    <span className={styles.itemTitulo}>{tituloItem(entidad, registro)}</span>
                    <span className={styles.itemSub}>{subtitulo(entidad, registro)}</span>
                  </span>
                  <span className={styles.itemSub}>
                    orden {String(registro.orden)} · {campo}: {vigente ? "sí" : "no"}
                  </span>
                </TextLink>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}

export default async function ContenidoListaPage({
  params,
}: {
  params: Promise<{ entidad: string }>;
}) {
  const { entidad } = await params;
  if (!esEntidadValida(entidad)) notFound();

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>{TITULO[entidad]}</h1>

      <Suspense fallback={<p className={styles.vacio}>Cargando contenido…</p>}>
        <ResultadosContenido entidad={entidad} />
      </Suspense>
    </div>
  );
}
