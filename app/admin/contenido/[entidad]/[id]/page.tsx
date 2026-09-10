import { notFound } from "next/navigation";
import { esEntidadValida, obtenerContenido } from "@/lib/data/admin/contenido";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../../../admin.module.css";
import { ContenidoForm } from "../ContenidoForm";

export const dynamic = "force-dynamic";

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

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Editar ítem</h1>
      <ContenidoForm entidad={entidad} item={item as Record<string, unknown> & { id: string }} />
    </div>
  );
}
