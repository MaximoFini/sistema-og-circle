import styles from "../../admin.module.css";
import { CuentaForm } from "../CuentaForm";

export default function CuentaNuevaPage() {
  return (
    <div className={styles.page}>
      <h1 className={styles.h1}>Nueva cuenta de cobro</h1>
      <p className={styles.lede}>
        La cuenta se crea inactiva. Para que los usuarios la vean, marcala como activa después.
      </p>
      <CuentaForm />
    </div>
  );
}
