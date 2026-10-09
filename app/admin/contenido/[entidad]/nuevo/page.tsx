import { notFound } from "next/navigation";
import { esEntidadValida } from "@/lib/data/admin/contenido";
import styles from "../../../admin.module.css";
import { ContenidoForm } from "../ContenidoForm";
import { MaterialForm } from "../MaterialFormLazy";

export default async function ContenidoNuevoPage({
  params,
}: {
  params: Promise<{ entidad: string }>;
}) {
  const { entidad } = await params;
  if (!esEntidadValida(entidad)) notFound();

  return (
    <div className={styles.page}>
      {/* VGRP-88: un material lleva archivo, así que tiene su propio form (con subida). */}
      <h1 className={styles.h1}>{entidad === "materiales" ? "Subir material" : "Crear ítem"}</h1>
      {entidad === "materiales" ? <MaterialForm /> : <ContenidoForm entidad={entidad} />}
    </div>
  );
}
