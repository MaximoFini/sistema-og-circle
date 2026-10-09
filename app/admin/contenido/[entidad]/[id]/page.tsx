import { notFound } from "next/navigation";
import { esEntidadValida, obtenerContenido } from "@/lib/data/admin/contenido";
import { urlPublicaFoto } from "@/lib/fotos/storage";
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

  const fila = item as Record<string, unknown> & { id: string };
  // Sólo agentes/profesionales tienen `foto_path`; para el resto queda en null.
  const fotoActualUrl = urlPublicaFoto(typeof fila.foto_path === "string" ? fila.foto_path : null);

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Editar ítem</h1>
      <ContenidoForm entidad={entidad} item={fila} fotoActualUrl={fotoActualUrl} />
    </div>
  );
}
