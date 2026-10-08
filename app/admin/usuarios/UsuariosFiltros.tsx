import { Button, TextFieldBase } from "@/components/ui";
import {
  ORDENES_USUARIOS,
  type OrdenUsuarios,
  PRUEBAS_USUARIOS,
  type PruebasUsuarios,
} from "@/lib/data/admin/usuarios";
import styles from "../admin.module.css";
import { NIVEL_LABELS, NIVELES, ORIGEN_LABELS, ORIGENES, ROL_LABELS, ROLES } from "../etiquetas";

// VGRP-36 — filtros del listado de usuarios. Form nativo `method="get"`: al
// enviar navega a `/admin/usuarios?q=...&nivel=...&rol=...&orden=...` y el
// Server Component vuelve a consultar. No necesita JS de cliente — "cargar
// más" es un link con el cursor (ver page.tsx). Las etiquetas de nivel y rol
// son las mismas que muestran las filas y la ficha (../etiquetas.ts).

const ETIQUETAS_ORDEN: Record<OrdenUsuarios, string> = {
  recientes: "Más nuevos primero",
  antiguos: "Más viejos primero",
  alfabetico: "Alfabético (email)",
};

// Cuentas de prueba (`profiles.es_prueba`): sin valor se ocultan.
const ETIQUETAS_PRUEBAS: Record<PruebasUsuarios, string> = {
  mostrar: "Mostrar",
  solo: "Solo de prueba",
};

export function UsuariosFiltros({
  q,
  nivel,
  rol,
  terminos,
  origen,
  pruebas,
  desde,
  hasta,
  orden,
}: {
  q?: string;
  nivel?: string;
  rol?: string;
  terminos?: string;
  origen?: string;
  pruebas?: string;
  desde?: string;
  hasta?: string;
  orden?: string;
}) {
  return (
    <form method="get" className={styles.filtros}>
      <TextFieldBase
        id="q"
        name="q"
        label="Email, nombre o teléfono"
        placeholder="Buscar"
        defaultValue={q ?? ""}
        autoComplete="off"
      />
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Nivel</span>
        <select name="nivel" defaultValue={nivel ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          {NIVELES.map((n) => (
            <option key={n} value={n}>
              {NIVEL_LABELS[n]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Rol</span>
        <select name="rol" defaultValue={rol ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          {ROLES.map((r) => (
            <option key={r} value={r}>
              {ROL_LABELS[r]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Términos</span>
        <select name="terminos" defaultValue={terminos ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          <option value="si">Aceptados</option>
          <option value="no">Sin aceptar</option>
        </select>
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Origen</span>
        <select name="origen" defaultValue={origen ?? ""} className={styles.selectNativo}>
          <option value="">Todos</option>
          {ORIGENES.map((o) => (
            <option key={o} value={o}>
              {ORIGEN_LABELS[o]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Cuentas de prueba</span>
        <select name="pruebas" defaultValue={pruebas ?? ""} className={styles.selectNativo}>
          <option value="">Ocultar</option>
          {PRUEBAS_USUARIOS.map((p) => (
            <option key={p} value={p}>
              {ETIQUETAS_PRUEBAS[p]}
            </option>
          ))}
        </select>
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Alta desde</span>
        <input type="date" name="desde" defaultValue={desde ?? ""} className={styles.filtroInput} />
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Alta hasta</span>
        <input type="date" name="hasta" defaultValue={hasta ?? ""} className={styles.filtroInput} />
      </label>
      <label className={styles.filtroCampo}>
        <span className={styles.filtroLabel}>Orden</span>
        <select name="orden" defaultValue={orden ?? "recientes"} className={styles.selectNativo}>
          {ORDENES_USUARIOS.map((o) => (
            <option key={o} value={o}>
              {ETIQUETAS_ORDEN[o]}
            </option>
          ))}
        </select>
      </label>
      <Button type="submit" variant="ghost">
        Filtrar
      </Button>
    </form>
  );
}
