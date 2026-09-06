"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FormError } from "@/components/ui";
import styles from "../../admin.module.css";

// VGRP-37 — reproceso de un pago. Client Component: `fetch` POST a
// `/api/admin/pagos/[id]/reprocesar` -> `router.refresh()` dentro de un
// `startTransition` para que el detalle (Server Component) vuelva a leer el
// nivel/flag y el botón siga en "reprocesando…" hasta que ese re-render
// termine (sin la transición el refetch no se espera y la pantalla se ve sin
// cambios hasta que Next repinta solo). Muestra el `409` ("el pago no es
// reprocesable") con `FormError`.
//
// SÓLO se renderiza si `pago.estado === 'approved'` — el gate lo hace el padre
// (page.tsx), acá no hace falta re-chequear.

export function ReprocesarButton({ pagoId }: { pagoId: string }) {
  const router = useRouter();
  const [refrescando, startTransition] = useTransition();
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
        startTransition(() => {
          router.refresh();
        });
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
      <Button type="button" onClick={reprocesar} loading={enviando || refrescando}>
        Reprocesar pago
      </Button>
      <FormError>{error}</FormError>
      {ok ? <p className={styles.formOk}>{ok}</p> : null}
    </div>
  );
}
