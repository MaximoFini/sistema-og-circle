"use client";

// Avatar circular de las tarjetas de directorio (agentes, profesionales) y de la
// vista previa del editor de fotos del admin. Con foto muestra la foto; sin foto,
// o si la foto no carga, las iniciales (como Contactos de Apple).
// Spec: specs/foto-perfil-agentes-profesionales (US-4).
//
// Decorativo (`aria-hidden`): el nombre siempre está escrito al lado.
//
// `<img>` nativo con el srcset armado acá contra el optimizador de Next
// (/_next/image → AVIF/WebP), sin importar `next/image`: tanto `<Image>` como
// `getImageProps()` arrastran sus utilidades al cliente (~5 kB gzip) y pasaban
// /dashboard de su presupuesto (docs/RENDIMIENTO.md).

import { type CSSProperties, useState } from "react";
import styles from "./Avatar.module.css";
import { iniciales } from "./iniciales";

// `images.imageSizes` por defecto de Next (no se cambia en next.config.ts). El
// optimizador sólo acepta estos anchos: se pide el menor que cubra cada densidad.
const ANCHOS_PERMITIDOS = [16, 32, 48, 64, 96, 128, 256, 384];

function urlOptimizada(src: string, px: number): string {
  const w = ANCHOS_PERMITIDOS.find((a) => a >= px) ?? ANCHOS_PERMITIDOS.at(-1);
  return `/_next/image?url=${encodeURIComponent(src)}&w=${w}&q=75`;
}

/** src + srcset 1x/2x. Un `blob:` (vista previa local) va directo, sin optimizar. */
function fuente(src: string, size: number): { src: string; srcSet?: string } {
  if (src.startsWith("blob:")) return { src };
  return {
    src: urlOptimizada(src, size),
    srcSet: `${urlOptimizada(src, size)} 1x, ${urlOptimizada(src, size * 2)} 2x`,
  };
}

export interface AvatarProps {
  nombre: string;
  /** URL pública de la foto, o un `blob:` local (vista previa del editor). */
  fotoUrl?: string | null;
  /** Lado en px. */
  size?: number;
  className?: string;
}

export function Avatar({ nombre, fotoUrl, size = 40, className }: AvatarProps) {
  // Se guarda QUÉ url falló (no un boolean): si cambia la foto, se vuelve a intentar.
  const [urlFallida, setUrlFallida] = useState<string | null>(null);
  const mostrarFoto = Boolean(fotoUrl) && fotoUrl !== urlFallida;

  return (
    <span
      className={[styles.avatar, className].filter(Boolean).join(" ")}
      style={{ "--avatar-size": `${size}px` } as CSSProperties}
      aria-hidden="true"
    >
      {mostrarFoto && fotoUrl ? (
        <img
          {...fuente(fotoUrl, size)}
          className={styles.foto}
          alt=""
          width={size}
          height={size}
          loading="lazy"
          decoding="async"
          onError={() => setUrlFallida(fotoUrl)}
        />
      ) : (
        iniciales(nombre)
      )}
    </span>
  );
}
