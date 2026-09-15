"use client";

// VGRP-40 — Edición de precios, con paso de confirmación inline (US-4: nunca
// se escribe sin que el admin vea "valor anterior → valor nuevo" y confirme
// explícitamente). Fetch/estado vía useAdminMutation (../useAdminMutation) —
// ver design.md specs/bloque-10-pendientes/design-vgrp40.md §Trade-offs para
// por qué es un paso inline y no un modal (el repo no tiene ningún primitive
// de Dialog hoy).

import { type FormEvent, useState } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import type { Config } from "@/lib/config/schema";
import { configSchema } from "@/lib/config/schema";
import { formatearPrecio } from "@/lib/format";
import styles from "../admin.module.css";
import { useAdminMutation } from "../useAdminMutation";

type Precios = Config["precios"];

const PRECIO_FIELD_SCHEMA = configSchema.shape.precios.shape.principiante;

function precioValido(v: string): boolean {
  if (v.trim() === "") return false;
  return PRECIO_FIELD_SCHEMA.safeParse(Number(v)).success;
}

export function PreciosForm({ preciosIniciales }: { preciosIniciales: Precios }) {
  const [principiante, setPrincipiante] = useState(String(preciosIniciales.principiante));
  const [avanzado, setAvanzado] = useState(String(preciosIniciales.avanzado));
  const [confirmando, setConfirmando] = useState(false);
  const { enviando, refrescando, error, ok, setError, submit } = useAdminMutation<
    { precios: Precios },
    { valorNuevo: Precios }
  >({
    url: "/api/admin/config",
    mensajeOk: "Precios actualizados.",
    extraerError: (data) => data.fieldErrors?.precios?.[0],
  });

  const principianteValido = precioValido(principiante);
  const avanzadoValido = precioValido(avanzado);
  const formValido = principianteValido && avanzadoValido;

  function pedirConfirmacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (!formValido) return;
    setConfirmando(true);
  }

  function cancelar() {
    setConfirmando(false);
  }

  async function confirmar() {
    const resultado = await submit({
      precios: { principiante: Number(principiante), avanzado: Number(avanzado) },
    });
    if (resultado) setConfirmando(false);
  }

  if (confirmando) {
    const cambios = [
      {
        label: "Principiante",
        antes: preciosIniciales.principiante,
        despues: Number(principiante),
      },
      { label: "Avanzado", antes: preciosIniciales.avanzado, despues: Number(avanzado) },
    ].filter((c) => c.antes !== c.despues);

    return (
      <div className={styles.confirmacion}>
        <p className={styles.confirmacionTitulo}>Confirmar cambio de precios</p>
        {cambios.length === 0 ? (
          <p className={styles.lede}>No hay cambios respecto al valor actual.</p>
        ) : (
          <ul className={styles.confirmacionLista}>
            {cambios.map((c) => (
              <li key={c.label} className={styles.confirmacionValor}>
                <strong>{c.label}:</strong> {formatearPrecio.format(c.antes)} →{" "}
                {formatearPrecio.format(c.despues)}
              </li>
            ))}
          </ul>
        )}
        <div className={styles.formAcciones}>
          <Button type="button" onClick={confirmar} loading={enviando || refrescando}>
            Confirmar
          </Button>
          <Button type="button" variant="ghost" onClick={cancelar} disabled={enviando}>
            Cancelar
          </Button>
        </div>
        <FormError>{error}</FormError>
      </div>
    );
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={pedirConfirmacion}>
      <TextField
        label="Precio Principiante (ARS)"
        type="number"
        min={1}
        step={1}
        value={principiante}
        onChange={(e) => setPrincipiante(e.target.value)}
        error={
          principiante !== "" && !principianteValido
            ? "Tiene que ser un entero mayor a cero."
            : null
        }
      />
      <TextField
        label="Precio Avanzado (ARS)"
        type="number"
        min={1}
        step={1}
        value={avanzado}
        onChange={(e) => setAvanzado(e.target.value)}
        error={avanzado !== "" && !avanzadoValido ? "Tiene que ser un entero mayor a cero." : null}
      />
      <FormError>{error}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}
      <Button type="submit" disabled={!formValido}>
        Revisar cambios
      </Button>
    </form>
  );
}
