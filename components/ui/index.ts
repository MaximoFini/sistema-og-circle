// Punto de entrada único de las primitivas de UI compartidas.
// Los formularios del Bloque 2 (VGRP-18 login/registro, VGRP-19 recuperación)
// importan desde acá: `import { Button, FormError, TextField } from "@/components/ui";`

// `Avatar` NO va en el barril: arrastra `next/image` y, exportado acá, sumaba
// ~7 kB al First Load de toda pantalla que importa el barril (docs/RENDIMIENTO.md).
// Se importa directo: `import { Avatar } from "@/components/ui/Avatar";`
export { Button, type ButtonProps } from "./Button";
export { Checkbox, type CheckboxProps } from "./Checkbox";
export { ContenidoBloqueado, type ContenidoBloqueadoProps } from "./ContenidoBloqueado";
export { FormError, type FormErrorProps } from "./FormError";
export { Icon, type IconName, type IconProps } from "./Icon";
export { PasswordField, type PasswordFieldProps } from "./PasswordField";
export { TarjetaDesbloqueo, type TarjetaDesbloqueoProps } from "./TarjetaDesbloqueo";
export { TextField, type TextFieldProps } from "./TextField";
export { TextFieldBase, type TextFieldBaseProps } from "./TextFieldBase";
export { TextLink, type TextLinkProps } from "./TextLink";
