import { notFound } from "next/navigation";
import type { CSSProperties } from "react";
import { Suspense } from "react";
import { TextLink } from "@/components/ui";
import {
  campoVigencia,
  type Entidad,
  esEntidadValida,
  listarContenido,
  listarVideosParaEditor,
} from "@/lib/data/admin/contenido";
import type { Tables } from "@/lib/database.types";
import { EXTENSIONES, type ExtensionMaterial, formatearTamano } from "@/lib/materiales/tipos";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../../admin.module.css";
import { estadoEspacio } from "./espacio";
import { ListadoReordenable } from "./ListadoReordenableLazy";
import materialesStyles from "./materiales-admin.module.css";
import { VideosEditor } from "./VideosEditor";

// VGRP-38 — listado de una entidad de contenido. Server Component: lectura
// directa por service role (bypassa RLS; la barrera de autorización es el rol
// de la capa de ruta — middleware + layout), mismo criterio que
// app/admin/usuarios/page.tsx.
//
// VGRP-88: los materiales se reordenan arrastrando (ListadoReordenable) y suman el indicador de espacio usado de Storage (plan Free, 1 GB).

export const dynamic = "force-dynamic";

const TITULO: Record<string, string> = {
  agentes: "Agentes de compra",
  videos: "Videos",
  profesionales: "Profesionales",
  servicios_financieros: "Servicios financieros",
  materiales: "Materiales adicionales",
};

function subtitulo(_entidad: string, item: Record<string, unknown>): string {
  if ("especialidad" in item) return String(item.especialidad ?? "");
  if ("rubro" in item) return String(item.rubro ?? "");
  return "";
}

function tituloItem(entidad: string, item: Record<string, unknown>): string {
  if (entidad === "servicios_financieros") return String(item.titulo ?? "");
  return String(item.nombre ?? "");
}

/** "PDF · 2,3 MB" para la segunda línea de un material. */
function subtituloMaterial(m: Tables<"materiales">): string {
  const tipo = EXTENSIONES[m.extension as ExtensionMaterial]?.tipo ?? m.extension;
  const etiqueta = { pdf: "PDF", powerpoint: "PowerPoint", excel: "Excel", word: "Word" }[tipo];
  return `${etiqueta ?? tipo} · ${formatearTamano(Number(m.tamano_bytes))}`;
}

function IndicadorEspacio({ materiales }: { materiales: Tables<"materiales">[] }) {
  const espacio = estadoEspacio(materiales.map((m) => m.tamano_bytes));
  return (
    <div className={materialesStyles.espacio}>
      <p
        className={
          espacio.advertencia ? materialesStyles.espacioAdvertencia : materialesStyles.espacioTexto
        }
      >
        {espacio.texto}
        {espacio.advertencia ? " — queda poco lugar en Storage (plan Free)." : ""}
      </p>
      <div
        className={materialesStyles.espacioBarra}
        role="progressbar"
        aria-label="Espacio usado en Storage"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={espacio.porcentaje}
      >
        <div
          className={
            espacio.advertencia
              ? materialesStyles.espacioLlenoAdvertencia
              : materialesStyles.espacioLleno
          }
          style={{ "--p": `${espacio.porcentaje}%` } as CSSProperties}
        />
      </div>
    </div>
  );
}

// Los videos no usan el listado genérico: se editan sobre una réplica de las grillas de
// /formacion (ver VideosEditor).
async function ResultadosVideos() {
  const admin = createServiceRoleClient();
  const videos = await listarVideosParaEditor(admin);

  return (
    <>
      <p className={styles.lede}>
        Así lo ve el usuario en Formación. Tocá un video para editarlo, agregá uno al final de cada
        stage y arrastrá los videos de un mismo stage para cambiar su orden.
      </p>
      <VideosEditor inicial={videos} />
    </>
  );
}

async function ResultadosContenido({ entidad }: { entidad: Entidad }) {
  const admin = createServiceRoleClient();
  const items = await listarContenido(admin, entidad);
  const campo = campoVigencia(entidad);
  const reordenable = entidad === "materiales";

  return (
    <>
      <p className={styles.lede}>
        {items.length} ítem(s),{" "}
        {reordenable ? "arrastrá para reordenar." : 'ordenados por "orden".'}
      </p>

      {entidad === "materiales" ? (
        <IndicadorEspacio materiales={items as Tables<"materiales">[]} />
      ) : null}

      {/* VGRP-54 punto 4 — "+ Crear nuevo" no depende de `items`, pero queda
          adentro del mismo Suspense que el lede (que sí depende) para no
          invertir el orden visual actual (hoy el lede va antes del botón). */}
      <div className={styles.formAcciones}>
        <TextLink href={`/admin/contenido/${entidad}/nuevo`} className={`${styles.card}`}>
          {entidad === "materiales" ? "+ Subir material" : "+ Crear nuevo"}
        </TextLink>
      </div>

      {items.length === 0 ? (
        <p className={styles.vacio}>Todavía no hay ítems cargados.</p>
      ) : entidad === "materiales" ? (
        <ListadoReordenable
          entidad="materiales"
          inicial={(items as Tables<"materiales">[]).map((m) => ({
            id: m.id,
            titulo: m.titulo,
            subtitulo: subtituloMaterial(m),
            publicado: m.publicado,
          }))}
        />
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
        {entidad === "videos" ? <ResultadosVideos /> : <ResultadosContenido entidad={entidad} />}
      </Suspense>
    </div>
  );
}
