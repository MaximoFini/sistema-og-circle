// Caché en memoria del navegador para los datos que las pantallas de la app piden
// DESPUÉS de hidratar (grillas de Inicio, progreso de videos). Ver docs/RENDIMIENTO.md,
// "Caché de cliente entre navegaciones".
//
// Problema que resuelve: Inicio y Formación son estáticas y lo dinámico se pide desde
// Client Components al montar. Navegar Formación → Inicio desmonta y vuelve a montar
// esos componentes, así que cada vuelta repetía los 4 viajes y mostraba "Cargando…"
// de nuevo. Con esto, la primera carga queda en memoria y las siguientes se pintan al
// instante.
//
// Reglas:
// - Vive en memoria de la pestaña (un refresh la vacía). Nunca en localStorage: guarda
//   datos gateados por plan (contactos).
// - Pasados `FRESCURA_MS`, el próximo montaje revalida EN SILENCIO: muestra lo que hay y
//   reemplaza cuando vuelve la respuesta. Mismo plazo que la caché de rutas de Next
//   (`staleTimes.static`, 5 min).
// - Se vacía al cambiar de sesión o de plan (`limpiarCacheDatos`): cerrar sesión,
//   entrar a /login, activarse el plan. Sin eso, otra cuenta en la misma pestaña podría
//   ver datos de la anterior.

import { useEffect, useRef, useSyncExternalStore } from "react";

export const FRESCURA_MS = 5 * 60 * 1000;

export interface EstadoDatos<T> {
  /** `undefined` hasta la primera respuesta buena. */
  datos: T | undefined;
  /** true cuando terminó al menos un intento (bien o mal): distingue "cargando" de "falló". */
  listo: boolean;
}

interface Entrada<T> {
  estado: EstadoDatos<T>;
  /** Cuándo llegaron los datos actuales (ms). 0 = nunca. */
  en: number;
  enVuelo: Promise<void> | null;
  oyentes: Set<() => void>;
}

const VACIO: EstadoDatos<never> = { datos: undefined, listo: false };

const entradas = new Map<string, Entrada<unknown>>();

function entrada<T>(clave: string): Entrada<T> {
  let e = entradas.get(clave) as Entrada<T> | undefined;
  if (!e) {
    e = { estado: VACIO, en: 0, enVuelo: null, oyentes: new Set() };
    entradas.set(clave, e as Entrada<unknown>);
  }
  return e;
}

function publicar<T>(e: Entrada<T>, estado: EstadoDatos<T>) {
  // Objeto nuevo en cada cambio: useSyncExternalStore compara por referencia.
  e.estado = estado;
  for (const oyente of e.oyentes) oyente();
}

/**
 * Pide los datos si no hay o si están viejos; si ya hay un pedido en vuelo, se suma a
 * ese. Un error no borra lo que ya había (fallo silencioso, mismo criterio que antes).
 * Sirve también para precargar antes de navegar (hover en el link a Inicio).
 */
export function precargar<T>(clave: string, cargar: () => Promise<T>): Promise<void> {
  const e = entrada<T>(clave);
  if (e.enVuelo) return e.enVuelo;
  if (e.estado.datos !== undefined && Date.now() - e.en < FRESCURA_MS) return Promise.resolve();

  const pedido = cargar()
    .then(
      (datos) => {
        if (e.enVuelo !== pedido) return; // se limpió la caché mientras viajaba
        e.en = Date.now();
        publicar(e, { datos, listo: true });
      },
      () => {
        if (e.enVuelo !== pedido) return;
        publicar(e, { datos: e.estado.datos, listo: true });
      },
    )
    .finally(() => {
      if (e.enVuelo === pedido) e.enVuelo = null;
    });
  e.enVuelo = pedido;
  return pedido;
}

/** Reemplaza los datos en memoria (p. ej. después de una escritura optimista). */
export function escribirDatos<T>(clave: string, actualizar: (previo: T | undefined) => T) {
  const e = entrada<T>(clave);
  e.en = Date.now();
  publicar(e, { datos: actualizar(e.estado.datos), listo: true });
}

/** Vacía todo: cambio de sesión o de plan. Los componentes montados vuelven a "cargando". */
export function limpiarCacheDatos() {
  for (const e of entradas.values()) {
    e.en = 0;
    e.enVuelo = null;
    publicar(e, VACIO);
  }
}

/**
 * Lee `clave` de la caché y la pide si hace falta. En una navegación de cliente con datos
 * ya cargados, el primer render ya los tiene (sin "Cargando…"). En la hidratación inicial
 * arranca vacío, igual que el HTML estático, y se completa después.
 */
export function useDatosCacheados<T>(clave: string, cargar: () => Promise<T>): EstadoDatos<T> {
  const e = entrada<T>(clave);
  const estado = useSyncExternalStore(
    (avisar) => {
      e.oyentes.add(avisar);
      return () => e.oyentes.delete(avisar);
    },
    () => e.estado,
    () => VACIO,
  );

  // Pide al montar (si hace falta) y otra vez sólo si alguien vació la caché con el
  // componente montado. NO vuelve a pedir cuando un pedido falla (sin bucle de reintentos).
  // `cargar` fuera de las dependencias a propósito: cada caller pasa una función nueva
  // por render, y lo que identifica al dato es la clave.
  const vaciada = estado === VACIO;
  const yaPidio = useRef(false);
  useEffect(() => {
    if (yaPidio.current && !vaciada) return;
    yaPidio.current = true;
    void precargar(clave, cargar);
  }, [clave, vaciada]);

  return estado;
}

/** Fetch JSON de un endpoint propio. Rechaza si no es 2xx (no se cachea un error). */
export async function pedirJson<T>(url: string): Promise<T> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`${url}: ${res.status}`);
  return (await res.json()) as T;
}
