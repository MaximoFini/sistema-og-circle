// Set de íconos del sistema: trazo de 1.7px, puntas redondeadas, grilla de
// 24px — la misma familia visual que SF Symbols en peso "regular". Dibujados
// a mano en SVG inline (sin dependencia nueva: docs/RENDIMIENTO.md, regla 8).
// Server Component: no lleva estado ni efectos.
//
// Siempre decorativos (`aria-hidden`): el nombre accesible lo da el texto del
// control que los contiene, nunca el ícono.

import type { ReactNode } from "react";

const PATHS = {
  inicio: (
    <>
      <path d="M4 10.2 12 4l8 6.2" />
      <path d="M6 9v9.5A1.5 1.5 0 0 0 7.5 20H10v-5.5h4V20h2.5a1.5 1.5 0 0 0 1.5-1.5V9" />
    </>
  ),
  calculadora: (
    <>
      <rect x="5" y="3" width="14" height="18" rx="3" />
      <path d="M8.5 7h7" />
      <path d="M9 12h.01M12 12h.01M15 12h.01M9 16h.01M12 16h.01M15 16h.01" />
    </>
  ),
  comunidad: (
    <>
      <circle cx="9" cy="9" r="3.2" />
      <path d="M3.5 19c.7-3 2.9-4.8 5.5-4.8s4.8 1.8 5.5 4.8" />
      <path d="M15.5 6a3 3 0 0 1 0 6" />
      <path d="M17 14.4c1.9.5 3 2.1 3.5 4.6" />
    </>
  ),
  tracking: (
    <>
      <path d="M12 3.5 19.5 7.5v9L12 20.5 4.5 16.5v-9z" />
      <path d="M4.5 7.5 12 11.5l7.5-4" />
      <path d="M12 11.5v9" />
    </>
  ),
  perfil: (
    <>
      <circle cx="12" cy="8.5" r="3.8" />
      <path d="M5 20c.9-3.6 3.7-5.6 7-5.6s6.1 2 7 5.6" />
    </>
  ),
  chevron: <path d="m10 6.5 5.5 5.5-5.5 5.5" />,
  externo: (
    <>
      <path d="M8 16 16 8" />
      <path d="M9.5 8H16v6.5" />
    </>
  ),
  candado: (
    <>
      <rect x="5.5" y="10.5" width="13" height="9.5" rx="2.5" />
      <path d="M8.5 10.5V8a3.5 3.5 0 0 1 7 0v2.5" />
    </>
  ),
  check: <path d="m6 12.5 4 4 8-9" />,
  salir: (
    <>
      <path d="M14 4.5h3A1.5 1.5 0 0 1 18.5 6v12a1.5 1.5 0 0 1-1.5 1.5h-3" />
      <path d="M10 16.5 5.5 12 10 7.5" />
      <path d="M5.5 12H15" />
    </>
  ),
  mensaje: <path d="M5 19.5 6.3 16A7.5 7.5 0 1 1 9 18.6z" />,
  documento: (
    <>
      <path d="M7 3.5h6.5L18 8v11a1.5 1.5 0 0 1-1.5 1.5h-9.5A1.5 1.5 0 0 1 5.5 19V5A1.5 1.5 0 0 1 7 3.5z" />
      <path d="M13 3.5V8.5h5" />
    </>
  ),
  play: (
    <path d="M9 6.8v10.4a.8.8 0 0 0 1.2.7l8.2-5.2a.8.8 0 0 0 0-1.4L10.2 6.1A.8.8 0 0 0 9 6.8z" />
  ),
} satisfies Record<string, ReactNode>;

export type IconName = keyof typeof PATHS;

export interface IconProps {
  name: IconName;
  size?: number;
  className?: string;
}

export function Icon({ name, size = 20, className }: IconProps) {
  const relleno = name === "play";
  return (
    <svg
      className={className}
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill={relleno ? "currentColor" : "none"}
      stroke={relleno ? "none" : "currentColor"}
      strokeWidth={1.7}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
    >
      {PATHS[name]}
    </svg>
  );
}
