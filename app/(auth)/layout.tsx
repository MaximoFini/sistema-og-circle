import type { ReactNode } from "react";
import styles from "./layout.module.css";

// =============================================================================
// VGRP-18 — Shell de `(auth)`: estático, mismo criterio que `(app)/layout.tsx`
// (VGRP-17).
//
// No lee cookies ni llama a `getVerifiedClaims()` / `createSupabaseServerClient()`:
// no tiene nada que decidir por sesión. Las rutas de este grupo (`/login`,
// `/registro`) son públicas por definición (ver `PUBLIC_PREFIXES` en
// `middleware.ts`) — quien las visita, por definición, todavía no tiene una
// sesión que valga la pena leer acá. Todo lo dinámico (validar el form,
// autenticar) vive en las Server Actions de `_actions.ts`, no en este layout.
// =============================================================================
export default function AuthLayout({ children }: { children: ReactNode }) {
  return (
    <div className={styles.shell}>
      <main className={styles.card}>{children}</main>
    </div>
  );
}
