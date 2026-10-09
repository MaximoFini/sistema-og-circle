// Foto de perfil de agentes y profesionales — mutaciones de `foto_path`.
// Spec: specs/foto-perfil-agentes-profesionales/design.md (§Key flows)
//
// Devuelven `ResultadoMutacion` para pasar por `conAuditoria()`, igual que el
// CRUD de lib/data/admin/contenido.ts. El cliente (service_role) se inyecta.
//
// ORDEN al reemplazar (US-3, "si falla a mitad de camino"):
//   1. subir el objeto nuevo
//   2. UPDATE foto_path
//   3. borrar el objeto viejo (best-effort)
// Si falla 1 o 2, la fila sigue apuntando a la foto anterior (y en 2 se borra el
// objeto recién subido). Si falla 3, queda basura en Storage, nunca un
// registro roto.

import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";
import type { ResultadoMutacion } from "../data/admin/audit-log";
import { ItemNoEncontrado } from "../data/admin/contenido";
import type { Database } from "../database.types";
import type { EntidadConFoto } from "./constantes";
import { borrarFoto, subirFoto, urlPublicaFoto } from "./storage";

type AdminClient = SupabaseClient<Database>;

/** Mismo motivo que `tabla()` en contenido.ts: el generador de tipos no
 *  angosta `.from()` con un nombre de tabla que es una unión. Ambas tablas
 *  tienen `id` y `foto_path`, que es lo único que se toca acá. */
function tabla(admin: AdminClient, entidad: EntidadConFoto) {
  return (admin as unknown as SupabaseClient).from(entidad);
}

/** Lo que el audit log necesita de la fila: su nombre (para describirla) y la foto. */
export interface FotoActual {
  nombre: string;
  foto_path: string | null;
}

/** Foto actual de la fila. Tira `ItemNoEncontrado` si no existe. */
export async function leerFoto(
  admin: AdminClient,
  entidad: EntidadConFoto,
  id: string,
): Promise<FotoActual> {
  const { data, error } = await tabla(admin, entidad)
    .select("nombre, foto_path")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!data) throw new ItemNoEncontrado(entidad, id);
  return data as FotoActual;
}

/** Sube `webp` (ya procesado con `procesarFoto`) y lo deja como foto de la fila. */
export async function cambiarFoto(
  admin: AdminClient,
  entidad: EntidadConFoto,
  id: string,
  webp: Buffer,
): Promise<ResultadoMutacion<{ fotoUrl: string | null }>> {
  const anterior = await leerFoto(admin, entidad, id);

  const nuevo = await subirFoto(admin, entidad, id, webp);

  const { error } = await tabla(admin, entidad).update({ foto_path: nuevo }).eq("id", id);
  if (error) {
    await borrarFoto(admin, nuevo);
    throw error;
  }

  if (anterior.foto_path) await borrarFoto(admin, anterior.foto_path);

  return {
    resultado: { fotoUrl: urlPublicaFoto(nuevo) },
    valorAnterior: { ...anterior },
    valorNuevo: { nombre: anterior.nombre, foto_path: nuevo },
    entidadId: id,
  };
}

/** Deja la fila sin foto y borra el objeto. `anterior` ya leído por el caller (con foto). */
export async function quitarFoto(
  admin: AdminClient,
  entidad: EntidadConFoto,
  id: string,
  anterior: FotoActual & { foto_path: string },
): Promise<ResultadoMutacion<null>> {
  const { error } = await tabla(admin, entidad).update({ foto_path: null }).eq("id", id);
  if (error) throw error;

  await borrarFoto(admin, anterior.foto_path);

  return {
    resultado: null,
    valorAnterior: { ...anterior },
    valorNuevo: { nombre: anterior.nombre, foto_path: null },
    entidadId: id,
  };
}
