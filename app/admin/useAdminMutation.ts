"use client";

// VGRP-40 — esqueleto compartido de mutación de admin: fetch PATCH +
// useTransition + router.refresh(). Mismo mecanismo que ya usan
// CambiarNivelForm.tsx y ReprocesarButton.tsx (fetch -> si 200, refrescar
// dentro de una transición para que el botón siga en estado "aplicando…"
// hasta que el Server Component padre termine de releer los datos; si no,
// mostrar el error) — extraído acá para que PreciosForm/FlagsForm no
// reimplementen el mismo bloque dos veces más. Los dos forms preexistentes
// no se tocan: son pantallas ya enviadas de otros tickets, fuera de este
// diff.

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

interface RespuestaError {
  error?: string;
  fieldErrors?: Record<string, string[] | undefined>;
}

interface UseAdminMutationOptions {
  url: string;
  mensajeOk: string;
  /** Extrae un mensaje de error más específico que `data.error` (p. ej. un fieldError). */
  extraerError?: (data: RespuestaError) => string | null | undefined;
}

export function useAdminMutation<TBody, TOk>({
  url,
  mensajeOk,
  extraerError,
}: UseAdminMutationOptions) {
  const router = useRouter();
  const [refrescando, startTransition] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function submit(body: TBody): Promise<TOk | null> {
    setEnviando(true);
    setError(null);
    setOk(null);

    try {
      const res = await fetch(url, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = (await res.json()) as TOk;
        setOk(mensajeOk);
        startTransition(() => {
          router.refresh();
        });
        return data;
      }

      const data = (await res.json().catch(() => ({}))) as RespuestaError;
      setError(extraerError?.(data) ?? data.error ?? "No se pudo guardar el cambio.");
      return null;
    } catch {
      setError("No se pudo conectar. Reintentá.");
      return null;
    } finally {
      setEnviando(false);
    }
  }

  return { enviando, refrescando, error, ok, setError, setOk, submit };
}
