"use client";

// Mismo patrón que TextField.tsx: "use client" sólo por los hooks (acá,
// además de `useId()`, el estado de visibilidad). El markup base sigue
// viviendo en TextFieldBase vía el slot `endAdornment`.

import { useId, useState } from "react";
import { Icon } from "./Icon";
import styles from "./TextField.module.css";
import { TextFieldBase, type TextFieldBaseProps } from "./TextFieldBase";

export interface PasswordFieldProps
  extends Omit<TextFieldBaseProps, "id" | "type" | "endAdornment"> {
  id?: string;
}

/** Campo de contraseña con un botón para mostrar/ocultar el texto mientras se escribe. */
export function PasswordField({ id, ...props }: PasswordFieldProps) {
  const autoId = useId();
  const [visible, setVisible] = useState(false);

  return (
    <TextFieldBase
      {...props}
      id={id ?? autoId}
      type={visible ? "text" : "password"}
      endAdornment={
        <button
          type="button"
          className={styles.toggleVisibilidad}
          onClick={() => setVisible((valor) => !valor)}
          aria-label={visible ? "Ocultar contraseña" : "Mostrar contraseña"}
          aria-pressed={visible}
        >
          <Icon name={visible ? "ojoTachado" : "ojo"} size={18} />
        </button>
      }
    />
  );
}
