import { notFound } from "next/navigation";
import { esEntidadValida } from "@/lib/data/admin/contenido";
import styles from "../../../admin.module.css";
import { ContenidoForm } from "../ContenidoForm";

export default async function ContenidoNuevoPage({
  params,
}: {
  params: Promise<{ entidad: string }>;
}) {
  const { entidad } = await params;
  if (!esEntidadValida(entidad)) notFound();

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Crear ítem</h1>
      <ContenidoForm entidad={entidad} />
    </div>
  );
}
