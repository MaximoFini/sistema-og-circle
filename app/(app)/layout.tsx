import type { ReactNode } from "react";
import styles from "./layout.module.css";

// =============================================================================
// VGRP-17 — Shell de `(app)`: estático a propósito.
//
// El gating de acceso (¿hay sesión válida?) ya lo resuelve `middleware.ts`,
// que corre ANTES de este layout y redirige a `/login` si no hay sesión —
// para cuando este Server Component se ejecuta, la sesión ya está
// garantizada. Por eso este archivo NO debe leer cookies ni llamar a
// `getVerifiedClaims()` / `createSupabaseServerClient()` directamente: hacer
// eso lo volvería dinámico (Next ya no puede prerenderizarlo) para repetir
// un chequeo que el middleware ya hizo.
//
// Patrón para contenido que sí varía por nivel/usuario (nombre, nivel
// activo, progreso — VGRP-27/VGRP-30, fuera de alcance de este ticket):
// NO se lee acá, en el Server Component del layout. Se resuelve desde un
// Client Component chico, montado dentro de un <Suspense>, por ejemplo:
//
//   <Suspense fallback={<UserBadgeSkeleton />}>
//     <UserBadge />
//   </Suspense>
//
// donde `UserBadge` es quien pide (fetch a un Route Handler, o un Server
// Component hijo streameado) los datos que dependen del claim del usuario.
// Así el shell principal (este layout + el `<html>`/`<body>` de
// `app/layout.tsx`) sigue prerenderizado como HTML estático, y sólo ese
// fragmento puntual se resuelve en cliente/streaming — sin forzar a toda la
// página a "dynamic rendering". Deliberadamente no se agrega ni el
// `<Suspense>` ni el `UserBadge` de ejemplo todavía: no hay contenido real
// que mostrar hasta VGRP-27/VGRP-30, y un placeholder que no hace nada es
// peor que este comentario. Cuando llegue ese ticket, el patrón a seguir es
// el de arriba.
// =============================================================================
export default function AppLayout({ children }: { children: ReactNode }) {
  return <div className={styles.shell}>{children}</div>;
}
