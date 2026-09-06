"use client";

import { useRouter } from "next/navigation";
import { type FormEvent, useState } from "react";
import { Button, FormError } from "@/components/ui";
import { Constants, type NivelAcceso } from "@/lib/database.types";
import styles from "../../admin.module.css";

// VGRP-36 — cambio manual de nivel. Client Component: `fetch` POST a
// `/api/admin/usuarios/[id]/nivel` -> `router.refresh()` para que el Server
// Component de la ficha vuelva a leer el nivel/overrides. Muestra los
// `fieldErrors` del 400 con `FormError`.

const NIVELES = Constants.public.Enums.nivel_acceso;

interface RespuestaError {
  error?: string;
  fieldErrors?: { nivel?: string[]; motivo?: string[] };
}

export function CambiarNivelForm({
  userId,
  nivelActual,
}: {
  userId: string;
  nivelActual: NivelAcceso;
}) {
  const router = useRouter();
  const [nivel, setNivel] = useState<NivelAcceso>(nivelActual);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function onSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setEnviando(true);
    setErrorGeneral(null);
    setErrorMotivo(null);
    setOk(null);

    try {
      const res = await fetch(`/api/admin/usuarios/${userId}/nivel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nivel, motivo }),
      });

      if (res.ok) {
        const data = (await res.json()) as { nivelAnterior: string; nivelNuevo: NivelAcceso };
        setOk(`Nivel actualizado: ${data.nivelAnterior} → ${data.nivelNuevo}.`);
        setMotivo("");
        // Resincronizar el <select> con el nivel que quedó vigente: puede
        // diferir del elegido (p. ej. un pago posterior al override gana).
        setNivel(data.nivelNuevo);
        router.refresh();
        return;
      }

      const data = (await res.json().catch(() => ({}))) as RespuestaError;
      setErrorMotivo(data.fieldErrors?.motivo?.[0] ?? null);
      setErrorGeneral(
        data.fieldErrors?.nivel?.[0] ?? data.error ?? "No se pudo aplicar el cambio.",
      );
    } catch {
      setErrorGeneral("No se pudo conectar. Reintentá.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <form className={styles.formCambiarNivel} onSubmit={onSubmit}>
      <label className={styles.formCampo}>
        <span className={styles.formLabel}>Nivel</span>
        <select
          className={styles.selectNativo}
          value={nivel}
          onChange={(e) => setNivel(e.target.value as NivelAcceso)}
        >
          {NIVELES.map((n) => (
            <option key={n} value={n}>
              {n}
            </option>
          ))}
        </select>
      </label>

      <label className={styles.formCampo}>
        <span className={styles.formLabel}>Motivo</span>
        <textarea
          className={styles.textareaNativo}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por qué se cambia el nivel a mano (obligatorio)"
          aria-invalid={errorMotivo ? true : undefined}
        />
        {errorMotivo ? <FormError>{errorMotivo}</FormError> : null}
      </label>

      <FormError>{errorGeneral}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}

      <Button type="submit" loading={enviando}>
        Aplicar cambio
      </Button>
    </form>
  );
}
