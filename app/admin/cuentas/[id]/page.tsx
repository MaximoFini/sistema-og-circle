import { notFound } from "next/navigation";
import { z } from "zod";
import { obtenerCuenta } from "@/lib/data/admin/cuentas";
import { createServiceRoleClient } from "@/lib/supabase/service-role";
import styles from "../../admin.module.css";
import { CuentaForm } from "../CuentaForm";
import { ActivarCuentaButton } from "./ActivarCuentaButton";

export const dynamic = "force-dynamic";

export default async function CuentaEditarPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  // Un id que no es uuid no tiene que llegar a la base (Postgres tiraría un
  // error de sintaxis de uuid en vez de un 404).
  if (!z.uuid().safeParse(id).success) notFound();

  const admin = createServiceRoleClient();
  const cuenta = await obtenerCuenta(admin, id);
  if (!cuenta) notFound();

  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Editar cuenta de cobro</h1>

      {cuenta.activa ? (
        <p className={styles.lede}>
          Esta es la cuenta activa: los usuarios la ven al pagar. Cualquier cambio se aplica al
          instante.
        </p>
      ) : (
        <ActivarCuentaButton cuentaId={cuenta.id} alias={cuenta.alias} />
      )}

      <CuentaForm cuenta={cuenta} />
    </div>
  );
}
