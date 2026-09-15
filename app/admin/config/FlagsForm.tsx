"use client";

// VGRP-40 — Edición de flags de fase. Sin paso de confirmación (US-3 no lo
// pide, a diferencia de precios — ver design.md
// specs/bloque-10-pendientes/design-vgrp40.md §Overview sobre por qué son dos
// formularios separados). Fetch/estado vía useAdminMutation (../useAdminMutation).

import { type FormEvent, useState } from "react";
import { Button, Checkbox, FormError } from "@/components/ui";
import type { Config } from "@/lib/config/schema";
import { FASES } from "@/lib/config/schema";
import styles from "../admin.module.css";
import { useAdminMutation } from "../useAdminMutation";

type Flags = Config["flags"];
type Fase = Flags["fase"];

export function FlagsForm({ flagsIniciales }: { flagsIniciales: Flags }) {
  const [checkoutHabilitado, setCheckoutHabilitado] = useState(flagsIniciales.checkout_habilitado);
  const [registroHabilitado, setRegistroHabilitado] = useState(flagsIniciales.registro_habilitado);
  const [fase, setFase] = useState<Fase>(flagsIniciales.fase);
  const { enviando, refrescando, error, ok, submit } = useAdminMutation<{ flags: Flags }, unknown>({
    url: "/api/admin/config",
    mensajeOk: "Flags actualizados.",
  });

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    await submit({
      flags: {
        checkout_habilitado: checkoutHabilitado,
        registro_habilitado: registroHabilitado,
        fase,
      },
    });
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={onSubmit}>
      <Checkbox
        label="Checkout habilitado"
        checked={checkoutHabilitado}
        onChange={(e) => setCheckoutHabilitado(e.target.checked)}
      />
      <Checkbox
        label="Registro habilitado"
        checked={registroHabilitado}
        onChange={(e) => setRegistroHabilitado(e.target.checked)}
      />
      <label className={styles.formCampo}>
        <span className={styles.formLabel}>Fase</span>
        <select
          className={styles.selectNativo}
          value={fase}
          onChange={(e) => setFase(e.target.value as Fase)}
        >
          {FASES.map((f) => (
            <option key={f} value={f}>
              Fase {f}
            </option>
          ))}
        </select>
      </label>

      <FormError>{error}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}

      <Button type="submit" loading={enviando || refrescando}>
        Guardar flags
      </Button>
    </form>
  );
}
