"use client";

// =============================================================================
// VGRP-22 — Polling de confirmación de pago (sin infra de Realtime).
//
// PUNTO CRÍTICO DEL PRD (repetido acá porque es el corazón de este archivo):
// esta pantalla NO debe afirmar que el acceso está activo hasta que el
// webhook de Mercado Pago (VGRP-23, ticket en paralelo) haya confirmado el
// pago y proyectado el nivel en la base. Esta pantalla NUNCA escribe nada —
// sólo lee, en loop, si esa proyección ya llegó.
//
// -----------------------------------------------------------------------------
// Por qué hace falta refrescar la sesión ANTES de cada consulta
// -----------------------------------------------------------------------------
// `consultarNivelActual()` (Server Action, en `../_actions.ts`) lee
// `getVerifiedClaims()`, que verifica el JWT de la cookie de sesión ACTUAL.
// Esa cookie no se actualiza sola: aunque el webhook ya haya corrido el
// Auth Hook (VGRP-16) y el `nivel` nuevo ya exista en la base, el JWT viejo
// en la cookie del browser lo sigue sin ver hasta que se emite uno nuevo.
// Por eso, en cada tick, ANTES de llamar al Server Action, se llama desde
// ACÁ (browser) a `supabase.auth.refreshSession()` con el cliente de
// `lib/auth/browser.ts` — eso fuerza a Supabase Auth a emitir un JWT nuevo,
// pasando de nuevo por el Auth Hook, que sí puede traer el `nivel`
// actualizado. Sin este paso, el polling completo no tiene sentido: seguiría
// viendo 'ninguno' para siempre aunque el pago ya esté confirmado.
//
// -----------------------------------------------------------------------------
// Timeout
// -----------------------------------------------------------------------------
// El webhook normalmente resuelve esto en segundos, pero "normalmente" no es
// una garantía (MP puede demorar la notificación, un reintento puede
// fallar). Después de `TIMEOUT_MS` sin ver un nivel distinto de 'ninguno' se
// deja de loopear — loopear para siempre es peor que decirle al usuario que
// esto está tardando y dónde pedir ayuda.
// =============================================================================

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { createSupabaseBrowserClient } from "@/lib/auth/browser";
import type { NivelAcceso } from "@/lib/database.types";
import { consultarNivelActual } from "../_actions";
import styles from "./pendiente.module.css";

const POLL_INTERVAL_MS = 2500;
const TIMEOUT_MS = 2 * 60 * 1000;

export interface PendienteClientProps {
  /** Sólo informativo — nunca una confirmación de que el nivel ya está activo. */
  nivelEsperado: NivelAcceso | null;
  /** Resuelto server-side vía `getLinks()` (Edge Config) — nunca hardcodeado acá. */
  whatsappUrl: string;
}

type EstadoPantalla = "esperando" | "confirmado" | "timeout";

export function PendienteClient({ nivelEsperado, whatsappUrl }: PendienteClientProps) {
  const router = useRouter();
  const [estado, setEstado] = useState<EstadoPantalla>("esperando");
  // Evita el clásico "setState después de desmontar" si el componente se
  // desmonta (navegación afuera) mientras un tick de polling está en vuelo.
  const montadoRef = useRef(true);

  useEffect(() => {
    montadoRef.current = true;
    const inicio = Date.now();
    const supabase = createSupabaseBrowserClient();

    const intervalId = setInterval(async () => {
      if (!montadoRef.current) return;

      if (Date.now() - inicio >= TIMEOUT_MS) {
        clearInterval(intervalId);
        setEstado("timeout");
        return;
      }

      // Ver el comentario grande de arriba: este refresh es lo que le da
      // sentido al polling. Si falla (red caída, sesión inválida), no se
      // trata como el timeout final — simplemente este tick no encuentra
      // nada nuevo y el próximo lo vuelve a intentar.
      try {
        await supabase.auth.refreshSession();
      } catch {
        return;
      }

      const { nivel } = await consultarNivelActual();
      if (!montadoRef.current) return;

      if (nivel !== "ninguno") {
        clearInterval(intervalId);
        setEstado("confirmado");
        router.push("/dashboard");
        router.refresh();
      }
    }, POLL_INTERVAL_MS);

    return () => {
      montadoRef.current = false;
      clearInterval(intervalId);
    };
  }, [router]);

  if (estado === "timeout") {
    return (
      <div className={styles.wrap}>
        <div className={styles.card}>
          <h1 className={styles.timeoutTitle}>Esto está tardando más de lo normal</h1>
          <p className={styles.copy}>
            Tu pago puede seguir en proceso del lado de Mercado Pago. Si ya pasaron unos minutos y
            no ves el acceso activado, escribinos por WhatsApp y lo revisamos.
          </p>
          <p className={styles.copy}>
            <a href={whatsappUrl} target="_blank" rel="noreferrer">
              Contactar por WhatsApp
            </a>
          </p>
        </div>
      </div>
    );
  }

  // "confirmado" también renderiza este estado (no uno de éxito propio): el
  // `router.push("/dashboard")` de arriba ya está en vuelo, así que lo único
  // que se ve acá es una fracción de segundo antes de navegar — no vale la
  // pena un estado visual nuevo sólo para eso.
  return (
    <div className={styles.wrap}>
      <div className={styles.card}>
        <div className={styles.spinner} aria-hidden="true" />
        <h1 className={styles.title}>Estamos confirmando tu pago</h1>
        <p className={styles.copy}>
          {nivelEsperado && nivelEsperado !== "ninguno" ? (
            <>
              Tu compra del nivel <span className={styles.nivelDestacado}>{nivelEsperado}</span>{" "}
              está siendo procesada por Mercado Pago.
            </>
          ) : (
            "Tu compra está siendo procesada por Mercado Pago."
          )}{" "}
          En cuanto se confirme, te llevamos a tu panel — no hace falta que hagas nada.
        </p>
      </div>
    </div>
  );
}
