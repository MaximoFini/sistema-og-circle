import {
  Body,
  Container,
  Head,
  Heading,
  Hr,
  Html,
  Link,
  Preview,
  Section,
  Text,
} from "@react-email/components";
import type { ReactNode } from "react";

/**
 * Layout base compartido de todos los emails de OG Circle (VGRP-25).
 *
 * ============================================================================
 * Tres restricciones que ordenan este archivo — no son preferencias de estilo.
 * ============================================================================
 *
 * 1. **TODO va inline.** Los clientes de correo no cargan hojas externas ni
 *    entienden CSS Modules; Gmail directamente borra el `<style>` del `<head>`
 *    en varios contextos. Por eso acá NO se importan `app/tokens.css` ni
 *    ningún `.module.css`: los valores de DESIGN.md están duplicados abajo como
 *    constantes JS a propósito, y esa duplicación es la decisión correcta.
 *    Fuente de la verdad de la paleta: DESIGN.md §1 / `app/tokens.css`.
 *
 * 2. **Nada crítico dentro de una imagen.** Los clientes que bloquean imágenes
 *    por defecto son la norma, no la excepción (Outlook, Gmail con remitente
 *    desconocido, la mayoría de los clientes corporativos). Un email de reset de
 *    contraseña con el botón dentro de un PNG es un email inútil. Por eso el
 *    logo de OG Circle acá es TEXTO con letter-spacing, no un `<img>`: se ve
 *    igual con imágenes bloqueadas, no necesita `alt`, y no depende de que
 *    exista un asset hosteado en un dominio que todavía no tenemos. Si algún día
 *    se agrega un `<Img>` decorativo, va con `alt` legible y nunca cargando
 *    información que no esté también en texto.
 *
 * 3. **Sin webfonts.** Montserrat/Helvetica Now Var no se cargan en clientes de
 *    correo (y `@font-face` está bloqueado en Outlook y Gmail). Se usan stacks
 *    con fallback de sistema: en la práctica esto se ve en Arial/Helvetica, y
 *    está bien. Ninguna decisión visual depende de que la fuente cargue.
 *
 * **Colores en HEX plano, no rgba.** DESIGN.md expresa la jerarquía de texto
 * como alfas de blanco (`rgba(255,255,255,.92)`), pero varios clientes de correo
 * viejos (Outlook desktop, que usa el motor de Word) ignoran `rgba()` y pintan
 * el texto en negro sobre negro. Cada token de abajo es el mismo color de
 * DESIGN.md ya **compuesto contra su fondo** y expresado en hex de 6 dígitos.
 *
 * **Fondo oscuro y clientes que invierten.** El sistema es dark-only (DESIGN.md
 * §0). Se declaran `color-scheme` / `supported-color-schemes` en el `<head>` y
 * se pinta el fondo en `<Body>` y en cada contenedor, porque los clientes que
 * fuerzan modo claro invierten lo que no tiene fondo explícito.
 */

// --- Paleta portada de DESIGN.md §1, compuesta a hex (ver comentario de arriba) ---
const BG = "#050505"; // --bg
const SUPERFICIE = "#0a0a0a"; // --surface-1
const BORDE = "#1e1e1e"; // --glass-border rgba(255,255,255,.08) sobre --surface-1
const ACENTO = "#d99e00"; // --accent-from (plano: los gradientes no viajan en email)
const CHAMPAGNE = "#cdb996"; // --champagne rgba(232,210,170,.88) sobre --bg
const TEXTO_PRIMARIO = "#ebebeb"; // --text-primary rgba(255,255,255,.92) sobre --bg
const TEXTO_SECUNDARIO = "#828282"; // --text-secondary rgba(255,255,255,.5) sobre --bg
const TEXTO_ATENUADO = "#787878"; // --text-muted rgba(255,255,255,.46) sobre --bg

const FUENTE_BODY = "Helvetica, Arial, sans-serif";
const FUENTE_HEADING = "'Montserrat', Helvetica, Arial, sans-serif";

/** Tokens reutilizables por las plantillas concretas de `emails/`. */
export const estilosEmail = {
  BG,
  SUPERFICIE,
  BORDE,
  ACENTO,
  CHAMPAGNE,
  TEXTO_PRIMARIO,
  TEXTO_SECUNDARIO,
  TEXTO_ATENUADO,
  FUENTE_BODY,
  FUENTE_HEADING,
} as const;

const estiloBody = {
  backgroundColor: BG,
  color: TEXTO_PRIMARIO,
  fontFamily: FUENTE_BODY,
  margin: "0",
  padding: "0",
  WebkitTextSizeAdjust: "100%",
} as const;

// `maxWidth` en vez de `width` fijo + `width: 100%`: así el contenedor se achica
// solo en mobile sin necesidad de media queries (que la mitad de los clientes
// tampoco soporta). El padding en `px` chico mantiene el texto lejos del borde
// en pantallas angostas.
const estiloContainer = {
  backgroundColor: SUPERFICIE,
  border: `1px solid ${BORDE}`,
  borderRadius: "12px",
  margin: "24px auto",
  maxWidth: "560px",
  padding: "32px 24px",
  width: "100%",
} as const;

const estiloLogo = {
  color: TEXTO_PRIMARIO,
  fontFamily: FUENTE_HEADING,
  fontSize: "13px",
  fontWeight: 700,
  letterSpacing: "0.28em",
  margin: "0",
  textTransform: "uppercase",
} as const;

const estiloReglaAcento = {
  backgroundColor: ACENTO,
  border: "none",
  height: "2px",
  margin: "12px 0 28px 0",
  width: "40px",
} as const;

const estiloTitulo = {
  color: TEXTO_PRIMARIO,
  fontFamily: FUENTE_HEADING,
  // Sin `clamp()`: no está soportado en clientes de correo. Un tamaño único que
  // funciona en mobile y desktop.
  fontSize: "24px",
  fontWeight: 800,
  letterSpacing: "-0.01em",
  lineHeight: "1.2",
  margin: "0 0 16px 0",
} as const;

const estiloSeparadorPie = {
  borderColor: BORDE,
  borderStyle: "solid",
  borderWidth: "1px 0 0 0",
  margin: "32px 0 20px 0",
} as const;

const estiloPie = {
  color: TEXTO_ATENUADO,
  fontFamily: FUENTE_BODY,
  fontSize: "12px",
  lineHeight: "1.6",
  margin: "0 0 8px 0",
} as const;

/** Estilo de párrafo estándar, para que las plantillas no reinventen el suyo. */
export const estiloParrafo = {
  color: TEXTO_SECUNDARIO,
  fontFamily: FUENTE_BODY,
  fontSize: "15px",
  lineHeight: "1.6",
  margin: "0 0 16px 0",
} as const;

/**
 * Estilo del CTA primario. DESIGN.md §1, regla dura: *"el ámbar nunca va como
 * fondo pleno detrás de texto blanco; cuando es fondo, el texto pasa a --bg"*.
 * Se usa color plano y no gradiente porque `linear-gradient` no se renderiza en
 * Outlook. `display: block` + `textAlign: center` hace que el botón ocupe el
 * ancho útil en mobile, que es donde se lee la mayoría de estos mails.
 */
export const estiloBoton = {
  backgroundColor: ACENTO,
  borderRadius: "8px",
  color: BG,
  display: "block",
  fontFamily: FUENTE_HEADING,
  fontSize: "15px",
  fontWeight: 700,
  padding: "14px 24px",
  textAlign: "center",
  textDecoration: "none",
} as const;

export interface EmailLayoutProps {
  /** Texto del preheader (lo que se ve en la bandeja antes de abrir). */
  preview: string;
  titulo: string;
  children: ReactNode;
}

export function EmailLayout({ preview, titulo, children }: EmailLayoutProps) {
  return (
    <Html lang="es">
      <Head>
        <meta name="color-scheme" content="dark" />
        <meta name="supported-color-schemes" content="dark" />
      </Head>
      <Preview>{preview}</Preview>
      <Body style={estiloBody}>
        <Container style={estiloContainer}>
          {/* Logo como TEXTO: se ve igual con imágenes bloqueadas. Ver punto 2. */}
          <Text style={estiloLogo}>OG Circle</Text>
          <Hr style={estiloReglaAcento} />

          <Heading as="h1" style={estiloTitulo}>
            {titulo}
          </Heading>

          <Section>{children}</Section>

          <Hr style={estiloSeparadorPie} />
          <Text style={estiloPie}>
            Te llegó este mail porque hay una cuenta de OG Circle asociada a esta dirección.
          </Text>
          <Text style={{ ...estiloPie, color: CHAMPAGNE, margin: "0" }}>
            OG Circle —{" "}
            <Link href="https://vegroup.vercel.app" style={{ color: CHAMPAGNE }}>
              vegroup.vercel.app
            </Link>
          </Text>
        </Container>
      </Body>
    </Html>
  );
}
