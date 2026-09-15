"use client";

// VGRP-40 — Edición de precios, con paso de confirmación inline (US-4: nunca
// se escribe sin que el admin vea "valor anterior → valor nuevo" y confirme
// explícitamente). Mismo esqueleto de fetch + `useTransition` + `router.refresh()`
// que `CambiarNivelForm`/`ReprocesarButton` — ver design.md
// specs/bloque-10-pendientes/design-vgrp40.md §Trade-offs para por qué es un
// paso inline y no un modal (el repo no tiene ningún primitive de Dialog hoy).

import { useRouter } from "next/navigation";
import { type FormEvent, useState, useTransition } from "react";
import { Button, FormError, TextField } from "@/components/ui";
import styles from "../admin.module.css";

interface Precios {
  principiante: number;
  avanzado: number;
}

interface RespuestaError {
  error?: string;
  fieldErrors?: { precios?: string[] };
}

function esEnteroPositivo(v: string): boolean {
  if (v.trim() === "") return false;
  const n = Number(v);
  return Number.isInteger(n) && n > 0;
}

export function PreciosForm({ preciosIniciales }: { preciosIniciales: Precios }) {
  const router = useRouter();
  const [refrescando, startTransition] = useTransition();
  const [principiante, setPrincipiante] = useState(String(preciosIniciales.principiante));
  const [avanzado, setAvanzado] = useState(String(preciosIniciales.avanzado));
  const [confirmando, setConfirmando] = useState(false);
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  const principianteValido = esEnteroPositivo(principiante);
  const avanzadoValido = esEnteroPositivo(avanzado);
  const formValido = principianteValido && avanzadoValido;

  function pedirConfirmacion(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    setOk(null);
    if (!formValido) return;
    setConfirmando(true);
  }

  function cancelar() {
    setConfirmando(false);
  }

  async function confirmar() {
    setEnviando(true);
    setError(null);
    try {
      const res = await fetch("/api/admin/config", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          precios: { principiante: Number(principiante), avanzado: Number(avanzado) },
        }),
      });

      if (res.ok) {
        setOk("Precios actualizados.");
        setConfirmando(false);
        startTransition(() => {
          router.refresh();
        });
        return;
      }

      const data = (await res.json().catch(() => ({}))) as RespuestaError;
      setError(data.fieldErrors?.precios?.[0] ?? data.error ?? "No se pudo guardar el cambio.");
      setConfirmando(false);
    } catch {
      setError("No se pudo conectar. Reintentá.");
      setConfirmando(false);
    } finally {
      setEnviando(false);
    }
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
                <strong>{c.label}:</strong> ${c.antes.toLocaleString("es-AR")} → $
                {c.despues.toLocaleString("es-AR")}
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
