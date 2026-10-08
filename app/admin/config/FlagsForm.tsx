"use client";

// VGRP-40 — Edición de flags. Sin paso de confirmación (US-3 no lo
// pide, a diferencia de precios — ver design.md
// specs/bloque-10-pendientes/design-vgrp40.md §Overview sobre por qué son dos
// formularios separados). Fetch/estado vía useAdminMutation (../useAdminMutation).
//
// `flags.fase` ya no se edita desde acá (era informativo, no controla nada): el
// endpoint igual lo exige, así que se reenvía tal cual está guardado.

import { type FormEvent, useState } from "react";
import { Button, Checkbox, FormError } from "@/components/ui";
import type { Config } from "@/lib/config/schema";
import styles from "../admin.module.css";
import { useAdminMutation } from "../useAdminMutation";

type Flags = Config["flags"];

export function FlagsForm({ flagsIniciales }: { flagsIniciales: Flags }) {
  const [checkoutHabilitado, setCheckoutHabilitado] = useState(flagsIniciales.checkout_habilitado);
  const [registroHabilitado, setRegistroHabilitado] = useState(flagsIniciales.registro_habilitado);
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
        fase: flagsIniciales.fase,
      },
    });
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={onSubmit}>
      {/* Cada aclaración va agrupada con su checkbox (formCampo, gap chico):
          con el gap de 16px del form quedaba a la misma distancia del
          checkbox siguiente y parecía pertenecer a ése. */}
      <div className={styles.formCampo}>
        <Checkbox
          label="Checkout habilitado"
          checked={checkoutHabilitado}
          onChange={(e) => setCheckoutHabilitado(e.target.checked)}
        />
        <p className={styles.formAyuda}>Hoy no controla nada en la app.</p>
      </div>
      <Checkbox
        label="Registro habilitado"
        checked={registroHabilitado}
        onChange={(e) => setRegistroHabilitado(e.target.checked)}
      />

      <FormError>{error}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}

      <Button type="submit" loading={enviando || refrescando}>
        Guardar flags
      </Button>
    </form>
  );
}
