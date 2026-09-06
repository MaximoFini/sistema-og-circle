"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { Button, FormError } from "@/components/ui";
import styles from "../../admin.module.css";

// VGRP-37 — reproceso de un pago. Client Component: `fetch` POST a
// `/api/admin/pagos/[id]/reprocesar` -> `router.refresh()` para que el Server
// Component del detalle vuelva a leer el nivel/flag. Muestra el `409` ("el pago
// no es reprocesable") con `FormError`.
//
// SÓLO se renderiza si `pago.estado === 'approved'` — el gate lo hace el padre
// (page.tsx), acá no hace falta re-chequear.

export function ReprocesarButton({ pagoId }: { pagoId: string }) {
  const router = useRouter();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [ok, setOk] = useState<string | null>(null);

  async function reprocesar() {
    setEnviando(true);
    setError(null);
    setOk(null);
    try {
      const res = await fetch(`/api/admin/pagos/${pagoId}/reprocesar`, { method: "POST" });
      if (res.ok) {
        const data = (await res.json()) as { nivelAnterior: string; nivelNuevo: string };
        setOk(`Reproceso aplicado: ${data.nivelAnterior} → ${data.nivelNuevo}.`);
        router.refresh();
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo reprocesar el pago.");
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.reprocesar}>
      <Button type="button" onClick={reprocesar} loading={enviando}>
        Reprocesar pago
      </Button>
      <FormError>{error}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}
    </div>
  );
}
