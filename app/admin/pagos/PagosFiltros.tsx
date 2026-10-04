import { Button, TextFieldBase } from "@/components/ui";
import styles from "../admin.module.css";
import { ESTADO_LABELS, ESTADOS } from "./estados";

// VGRP-37 — filtros del ledger de pagos. Form nativo `method="get"`: al enviar
// navega a `/admin/pagos?estado=...&desde=...&hasta=...&ref=...` y el Server
// Component vuelve a consultar. No necesita JS de cliente — "cargar más" es un
// link con el cursor (ver page.tsx).

// Un `<select>` acotado a los estados reales es más útil que un input libre
// para el admin (ver ./estados.ts).

export function PagosFiltros({
  estado,
  desde,
  hasta,
  proveedorRef,
}: {
  estado?: string;
  desde?: string;
  hasta?: string;
  proveedorRef?: string;
}) {
  return (
    <form method="get" className={styles.filtros}>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Estado</span>
        <select name="estado" defaultValue={estado ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          {ESTADOS.map((e) => (
            <option key={e} value={e}>
              {ESTADO_LABELS[e]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Desde</span>
        <input type="date" name="desde" defaultValue={desde ?? ""} className={styles.filtroInput} />
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Hasta</span>
        <input type="date" name="hasta" defaultValue={hasta ?? ""} className={styles.filtroInput} />
      </label>
      <TextFieldBase
        id="ref"
        name="ref"
        label="Referencia del proveedor"
        placeholder="Buscar"
        defaultValue={proveedorRef ?? ""}
        autoComplete="off"
      />
      <Button type="submit" variant="ghost">
        Filtrar
      </Button>
    </form>
  );
}
