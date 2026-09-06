import { Button, TextField } from "@/components/ui";
import styles from "../admin.module.css";

// VGRP-37 — filtros del ledger de pagos. Form nativo `method="get"`: al enviar
// navega a `/admin/pagos?estado=...&desde=...&hasta=...&ref=...` y el Server
// Component vuelve a consultar. No necesita JS de cliente — "cargar más" es un
// link con el cursor (ver page.tsx).

// Estados que hoy puede tomar un pago de Mercado Pago en el ledger. `estado` es
// texto libre en la base (`pagos.estado`), pero estos son los valores reales que
// escribe el webhook (VGRP-23) — un `<select>` acotado es más útil que un input
// libre para el admin.
const ESTADOS = ["approved", "pending", "in_process", "rejected", "refunded", "cancelled"] as const;

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
              {e}
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
      <TextField
        name="ref"
        label="Referencia del proveedor"
        placeholder="buscar por proveedor_ref"
        defaultValue={proveedorRef ?? ""}
        autoComplete="off"
      />
      <Button type="submit" variant="ghost">
        Filtrar
      </Button>
    </form>
  );
}
