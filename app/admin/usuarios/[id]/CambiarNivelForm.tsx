"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FormError } from "@/components/ui";
import type { NivelAcceso } from "@/lib/database.types";
import styles from "../../admin.module.css";

// VGRP-36 — cambio manual de nivel. Client Component: `fetch` POST a
// `/api/admin/usuarios/[id]/nivel` -> `router.refresh()` dentro de un
// `startTransition` para que la ficha (Server Component) vuelva a leer el
// nivel/overrides y el botón se mantenga en estado "aplicando…" HASTA que ese
// re-render termine. Sin la transición, `router.refresh()` dispara el refetch
// pero no se espera: el botón vuelve a estado normal de inmediato y la pantalla
// se ve sin cambios hasta que Next repinta solo — parece que no hizo nada.
// Muestra los `fieldErrors` del 400 con `FormError`.
//
// VGRP-59/60 (Bloque 13 — plan único): con sólo dos valores en el enum
// (ninguno/completo) ya no tiene sentido un <select> de niveles — la acción
// es binaria: "Dar acceso" (POST nivel='completo') / "Quitar acceso" (POST
// nivel='ninguno'). El contrato HTTP de /api/admin/usuarios/[id]/nivel no
// cambió (sigue aceptando { nivel, motivo } contra el enum real vía
// Constants.public.Enums.nivel_acceso) — esto es sólo una simplificación de
// la UI.

const NIVEL_CON_ACCESO: NivelAcceso = "completo";
const NIVEL_SIN_ACCESO: NivelAcceso = "ninguno";

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
  const [refrescando, startTransition] = useTransition();
  const [nivel, setNivel] = useState<NivelAcceso>(nivelActual);
  const [motivo, setMotivo] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [errorGeneral, setErrorGeneral] = useState<string | null>(null);
  const [errorMotivo, setErrorMotivo] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function aplicar(nivelElegido: NivelAcceso) {
    setEnviando(true);
    setErrorGeneral(null);
    setErrorMotivo(null);
    setOk(null);

    try {
      const res = await fetch(`/api/admin/usuarios/${userId}/nivel`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ nivel: nivelElegido, motivo }),
      });

      if (res.ok) {
        const data = (await res.json()) as { nivelAnterior: string; nivelNuevo: NivelAcceso };
        setOk(`Nivel actualizado: ${data.nivelAnterior} → ${data.nivelNuevo}.`);
        setMotivo("");
        // Resincronizar con el nivel que quedó vigente: puede diferir del
        // elegido (p. ej. un pago posterior al override gana).
        setNivel(data.nivelNuevo);
        // Re-fetch de la ficha (Server Component). En una transición para que
        // `refrescando` siga true hasta que el re-render termine.
        startTransition(() => {
          router.refresh();
        });
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

  const tieneAccesoActual = nivel === "completo";

  return (
    <div className={styles.formCambiarNivel}>
      <p className={styles.lede}>
        Acceso actual: <strong>{tieneAccesoActual ? "con acceso" : "sin acceso"}</strong>.
      </p>

      <label className={styles.formCampo}>
        <span className={styles.formLabel}>Motivo</span>
        <textarea
          className={styles.textareaNativo}
          value={motivo}
          onChange={(e) => setMotivo(e.target.value)}
          placeholder="Por qué se cambia el acceso a mano (obligatorio)"
          aria-invalid={errorMotivo ? true : undefined}
        />
        {errorMotivo ? <FormError>{errorMotivo}</FormError> : null}
      </label>

      <FormError>{errorGeneral}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}

      <div className={styles.formAcciones}>
        <Button
          type="button"
          onClick={() => aplicar(NIVEL_CON_ACCESO)}
          loading={enviando || refrescando}
          disabled={tieneAccesoActual}
        >
          Dar acceso
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => aplicar(NIVEL_SIN_ACCESO)}
          loading={enviando || refrescando}
          disabled={!tieneAccesoActual}
        >
          Quitar acceso
        </Button>
      </div>
    </div>
  );
}
