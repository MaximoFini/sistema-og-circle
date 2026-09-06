import { Button, TextField } from "@/components/ui";
import styles from "../admin.module.css";

// VGRP-35 — filtros de la pantalla de auditoría. Form nativo `method="get"`:
// al enviar navega a `/admin/auditoria?actor=...&desde=...&hasta=...` y el
// Server Component vuelve a consultar. No necesita JS de cliente — "cargar
// más" es un link con el cursor (ver page.tsx).
export function AuditoriaFiltros({
  actor,
  desde,
  hasta,
}: {
  actor?: string;
  desde?: string;
  hasta?: string;
}) {
  return (
    <form method="get" className={styles.filtros}>
      <TextField
        name="actor"
        label="Actor (email)"
        placeholder="buscar por email"
        defaultValue={actor ?? ""}
        autoComplete="off"
      />
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Desde</span>
        <input type="date" name="desde" defaultValue={desde ?? ""} className={styles.filtroInput} />
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Hasta</span>
        <input type="date" name="hasta" defaultValue={hasta ?? ""} className={styles.filtroInput} />
      </label>
      <Button type="submit" variant="ghost">
        Filtrar
      </Button>
    </form>
  );
}
