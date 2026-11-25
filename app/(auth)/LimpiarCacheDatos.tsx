"use client";

// Red de contención de lib/cliente/cache-datos.ts: llegar a /login o /registro sin pasar
// por "Cerrar sesión" (sesión vencida, redirect del middleware) también es un cambio de
// cuenta posible en la misma pestaña. Hoja mínima: no pinta nada.

import { useEffect } from "react";
import { limpiarCacheDatos } from "@/lib/cliente/cache-datos";

export function LimpiarCacheDatos() {
  useEffect(() => {
    limpiarCacheDatos();
  }, []);
  return null;
}
