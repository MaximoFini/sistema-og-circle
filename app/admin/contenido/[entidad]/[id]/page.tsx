import { notFound } from "next/navigation";
import { esEntidadValida, obtenerContenido } from "@/lib/data/admin/contenido";
import type { Tables } from "@/lib/database.types";
import { urlPublicaFoto } from "@/lib/fotos/storage";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../../../admin.module.css";
import { ContenidoForm } from "../ContenidoForm";
import { MaterialForm } from "../MaterialFormLazy";

export const dynamic = "force-dynamic";

function aEditable(m: Tables<"materiales">) {
  return {
    id: m.id,
    titulo: m.titulo,
    descripcion: m.descripcion,
    publicado: m.publicado,
    extension: m.extension,
    tamano_bytes: Number(m.tamano_bytes),
  };
}

export default async function ContenidoEditarPage({
  params,
}: {
  params: Promise<{ entidad: string; id: string }>;
}) {
  const { entidad, id } = await params;
  if (!esEntidadValida(entidad)) notFound();

  const admin = createServiceRoleClient();
  const item = await obtenerContenido(admin, entidad, id);
  if (!item) notFound();

  const fila = item as Record<string, unknown> & { id: string };
  // Sólo agentes/profesionales tienen `foto_path`; para el resto queda en null.
  const fotoActualUrl = urlPublicaFoto(typeof fila.foto_path === "string" ? fila.foto_path : null);

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>{entidad === "materiales" ? "Editar material" : "Editar ítem"}</h1>
      {entidad === "materiales" ? (
        // VGRP-88: sin `storage_path` al cliente: el form no lo necesita.
        <MaterialForm item={aEditable(item as Tables<"materiales">)} />
      ) : (
        <ContenidoForm entidad={entidad} item={fila} fotoActualUrl={fotoActualUrl} />
      )}
    </div>
  );
}
