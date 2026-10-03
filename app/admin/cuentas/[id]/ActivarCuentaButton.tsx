"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Button, FormError } from "@/components/ui";
import styles from "../../admin.module.css";

// VGRP-62 — "Marcar como activa". Pide confirmación porque cambia a dónde
// transfieren TODOS los usuarios desde ese momento. Mismo mecanismo que
// app/admin/pagos/[id]/ReprocesarButton.tsx: fetch -> router.refresh() dentro
// de una transición, para que el botón siga en "activando…" hasta que el Server
// Component padre relea el estado.
//
// SÓLO se renderiza si la cuenta NO está activa — el gate lo hace el padre.

export function ActivarCuentaButton({ cuentaId, alias }: { cuentaId: string; alias: string }) {
  const router = useRouter();
  const [refrescando, startTransition] = useTransition();
  const [enviando, setEnviando] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function activar() {
    const ok = window.confirm(
      `¿Marcar "${alias}" como la cuenta activa?\n\nDesde ahora los usuarios van a ver estos datos para transferir.`,
    );
    if (!ok) return;

    setEnviando(true);
    setError(null);
    try {
      const res = await fetch(`/api/admin/cuentas/${cuentaId}/activar`, { method: "POST" });
      if (res.ok) {
        startTransition(() => {
          router.refresh();
        });
        return;
      }
      const data = (await res.json().catch(() => ({}))) as { error?: string };
      setError(data.error ?? "No se pudo activar la cuenta.");
    } catch {
      setError("No se pudo conectar. Reintentá.");
    } finally {
      setEnviando(false);
    }
  }

  return (
    <div className={styles.reprocesar}>
      <Button type="button" onClick={activar} loading={enviando || refrescando}>
        Marcar como activa
      </Button>
      <FormError>{error}</FormError>
    </div>
  );
}
