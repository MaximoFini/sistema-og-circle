"use client";

// VGRP-40 — Edición de flags de fase. Sin paso de confirmación (US-3 no lo
// pide, a diferencia de precios — ver design.md
// specs/bloque-10-pendientes/design-vgrp40.md §Overview sobre por qué son dos
// formularios separados). Mismo esqueleto de fetch + `useTransition` +
// `router.refresh()` que el resto del panel.

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { Button, Checkbox, FormError } from "@/components/ui";
import type { Config } from "@/lib/config/schema";
import styles from "../admin.module.css";

type Fase = Config["flags"]["fase"];
// Mismo enum que `configSchema.shape.flags.shape.fase` (lib/config/schema.ts)
// — hardcodeado acá como literal en vez de derivado en runtime para no
// depender de la forma interna de `ZodEnum` entre versiones de Zod.
const FASES: readonly Fase[] = ["1", "2", "3", "4"];

interface Flags {
  checkout_habilitado: boolean;
  registro_habilitado: boolean;
  fase: Fase;
}

export function FlagsForm({ flagsIniciales }: { flagsIniciales: Flags }) {
  const router = useRouter();
  const [refrescando, startTransition] = useTransition();
  const [checkoutHabilitado, setCheckoutHabilitado] = useState(flagsIniciales.checkout_habilitado);
  const [registroHabilitado, setRegistroHabilitado] = useState(flagsIniciales.registro_habilitado);
  const [fase, setFase] = useState<Fase>(flagsIniciales.fase);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setError(null);
    setOk(null);

    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          flags: {
            checkout_habilitado: checkoutHabilitado,
            registro_habilitado: registroHabilitado,
            fase,
          },
        }),
      });

      if (res.ok) {
        setOk("Flags actualizados.");
        startTransition(() => {
          router.refresh();
        });
        return;
      }

      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo guardar el cambio.");
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setEnviando(false);
    }
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
