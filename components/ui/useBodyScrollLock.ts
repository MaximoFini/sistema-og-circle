"use client";

// Bloquea el scroll del <body> mientras `activo` sea true. Ver body-scroll-lock.ts por qué
// lleva un contador en vez de guardar y restaurar el valor previo.

import { useEffect } from "react";
import { bloquearScroll } from "./body-scroll-lock";

export function useBodyScrollLock(activo: boolean): void {
  useEffect(() => {
    if (!activo) return;
    return bloquearScroll(document.body);
  }, [activo]);
}
