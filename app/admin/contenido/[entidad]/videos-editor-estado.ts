// Estado del editor de videos del admin: transiciones PURAS (sin React ni DOM) para poder
// testearlas. `VideosEditor` las usa con `useState`. Reciben y devuelven el mismo tipo que
// arma el servidor (`VideosParaEditor`), así lo que se ve tras guardar es lo mismo que
// se vería recargando la página.
//
// El estado se actualiza con la fila que devuelve la API en vez de llamar a
// `router.refresh()`: ese patrón ya mostró un cuelgue intermitente en este repo (VGRP-86).

import type { GrillaEditor, VideoEditor, VideosParaEditor } from "@/lib/data/admin/contenido";
import { videoProvider } from "@/lib/video/provider";

/** Lo que devuelven `POST` y `PATCH` de contenido para un video (la fila de la tabla). */
export interface FilaVideoApi {
  id: string;
  stage: number;
  titulo: string;
  descripcion: string | null;
  provider_ref: string | null;
  publicado: boolean;
  orden: number;
}

/** Misma regla que `armarVideosEditor` (servidor): miniatura sólo si está publicado y su
 *  link es válido. */
export function filaAVideoEditor(fila: FilaVideoApi): VideoEditor {
  const ref =
    fila.publicado && fila.provider_ref ? videoProvider.parsearRef(fila.provider_ref) : null;
  return {
    id: fila.id,
    stage: fila.stage as VideoEditor["stage"],
    titulo: fila.titulo,
    descripcion: fila.descripcion,
    providerRef: fila.provider_ref,
    publicado: fila.publicado,
    orden: fila.orden,
    thumbnailUrl: ref ? videoProvider.urlThumbnail(ref) : null,
  };
}

function porOrden(a: VideoEditor, b: VideoEditor): number {
  return a.orden - b.orden;
}

/**
 * Aplica un video recién creado o editado: lo saca de donde estuviera y lo pone en la
 * lista que le corresponde según `publicado`, con cada lista ordenada por `orden`.
 * Un video publicado de nuevo trae un `orden` al final (lo asigna el servidor), así que
 * queda último en la grilla.
 */
export function aplicarGuardado(estado: VideosParaEditor, video: VideoEditor): VideosParaEditor {
  if (video.stage !== 1 && video.stage !== 2) return estado;
  const stage = video.stage;

  const sinEl = (lista: VideoEditor[]) => lista.filter((v) => v.id !== video.id);
  const grilla: GrillaEditor = {
    publicados: sinEl(estado[stage].publicados),
    despublicados: sinEl(estado[stage].despublicados),
  };
  if (video.publicado) grilla.publicados = [...grilla.publicados, video].sort(porOrden);
  else grilla.despublicados = [...grilla.despublicados, video].sort(porOrden);

  return { ...estado, [stage]: grilla };
}

/**
 * Aplica el orden que el servidor ya guardó (`ids` = los publicados del stage en el orden
 * nuevo). Los ids que no están en `ids` (no debería haber) quedan al final, sin perderse.
 * El `orden` numérico de cada video se reasigna a la posición, igual que hace el servidor
 * (reparte los mismos lugares), para que un `aplicarGuardado` posterior ordene bien.
 */
export function aplicarOrden(
  estado: VideosParaEditor,
  stage: 1 | 2,
  ids: string[],
): VideosParaEditor {
  const actuales = estado[stage].publicados;
  const porId = new Map(actuales.map((v) => [v.id, v]));
  const lugares = actuales.map((v) => v.orden).sort((a, b) => a - b);

  const reordenados: VideoEditor[] = [];
  for (const id of ids) {
    const v = porId.get(id);
    if (v) reordenados.push(v);
  }
  for (const v of actuales) if (!ids.includes(v.id)) reordenados.push(v);

  const conLugares = reordenados.map((v, i) => ({ ...v, orden: lugares[i] ?? v.orden }));
  return { ...estado, [stage]: { ...estado[stage], publicados: conLugares } };
}
