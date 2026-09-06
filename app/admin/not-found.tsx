import { TextLink } from "@/components/ui";
import styles from "./admin.module.css";

// VGRP-35 — 404 del área de admin. Lo dispara `requireAdminPage()` (layout)
// cuando un usuario con sesión pero `rol != 'admin'` llega a `/admin`, y
// también cualquier ruta inexistente bajo `/admin`. Nunca revela si la ruta
// concreta existe: mismo cuerpo para "no sos admin" que para "no existe".
export default function AdminNotFound() {
  return (
    <div className={styles.notFound}>
      <p className={styles.notFoundCode}>404</p>
      <h1 className={styles.notFoundTitle}>No encontramos esta página</h1>
      <p className={styles.notFoundCopy}>La dirección no existe o no tenés acceso.</p>
      <TextLink href="/dashboard" className={styles.notFoundLink}>
        Volver al inicio
      </TextLink>
    </div>
  );
}
