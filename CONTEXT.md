# CONTEXT.md — Contexto general

> Fuente: páginas de Plane "Contexto del Proyecto" y "Roadmap de 4 fases" (proyecto Sistema OG Circle, VGRP). Última sincronización: 2026-08-21.

**Estado del proyecto:** pre-desarrollo. No existe código de producción. Todo lo que hay hoy son documentos de especificación (versionados, con historial de decisiones) y un prototipo HTML clickeable de referencia. Este documento explica el *por qué* detrás de cada decisión registrada en esos documentos — el código todavía no existe, así que no hay un "qué" que leer.

## 1. Qué es Outsider Jota / VeGroup

Una plataforma cerrada y paga para personas en Argentina de 20 a 40 años que quieren importar mercadería de China y venderla online. No es un curso: el diferenciador declarado en `landing.md` es "todos venden el mapa, nosotros te damos las llaves del auto" — el valor no es la información (eso ya está en YouTube gratis), es el acceso directo a la infraestructura operativa que ya usa Jota Vera para operar su propio negocio: agentes de compra en China, depósitos, flete, SWIFT y una calculadora de costos ya construida.

## 2. El problema que resuelve (por qué existe cada pieza)

De `landing.md` sección 5, las 4 cards del problema mapean 1:1 a las 4 piezas de infraestructura de la plataforma. Esto no es casualidad — cada feature de la plataforma existe para resolver un miedo específico documentado:

| Miedo del usuario | Feature que lo resuelve |
|---|---|
| "No sé cuánto me sale realmente" (piensa que gana 40%, en realidad es 4% después de arancel, IVA, tasa estadística y despacho) | Calculadora de costos de importación |
| "No sé en quién confiar" (buscar agente en Instagram es una lotería) | Directorio de 6 agentes de compra verificados en China |
| "No sé cómo pagarles" (mandar plata a China sin estructura) | SWIFT + servicios financieros (solo nivel Avanzado) |
| "¿Y ahora dónde lo vendo?" | Stage 2: 3 videos para armar tienda (Tienda Nube / Shopify) |

## 3. Quién lo usa y con qué permisos

No hay roles de equipo/staff definidos todavía más allá de "administrador" (confirma pagos manuales, gestiona contenido). Los usuarios finales se dividen por **nivel de acceso**, no por rol:

| Nivel | Precio (early adopter) | Qué desbloquea |
|---|---|---|
| Principiante | $75.000 | Formación completa (11 videos), calculadora, comunidad, profesionales, servicios financieros |
| Avanzado | $125.000 | Todo lo de Principiante + depósitos Miami/China/España, agente de muestras y de volumen, flete y despacho gestionado, tracking, marítimo, SWIFT |

Un usuario puede subir de Principiante a Avanzado pagando solo la diferencia ($60.000 ARS según `resumen-ejecutivo.md` §2.2). El control de acceso por nivel se planea implementar con **Row-Level Security en Supabase** directo en la base — no en el frontend — para que un usuario Principiante no pueda leer contenido de Avanzado ni haciendo una consulta directa.

## 4. Vocabulario del dominio

| Término | Significado |
|---|---|
| Emi / Joaco Vera | Dueño de la operación real de importación que la plataforma empaqueta y vende. Es la autoridad/cara del producto. |
| Agente de compra | Persona en China que gestiona la compra, inspección y a veces fabricación de la mercadería. La plataforma da acceso directo a 6 agentes verificados con los que Jota ya opera. |
| FOB | Free On Board — el costo del producto antes de flete, seguro y aduana. Es el dato que se carga en la calculadora. |
| Depósito | Punto físico de consolidación de mercadería antes de enviarla a Argentina. Ubicados en Miami, China y España (los dos últimos solo nivel Avanzado). |
| Despacho | Trámite aduanero para nacionalizar la mercadería al llegar a Argentina. |
| Stage 1 / Stage 2 | Los dos bloques de formación en video. Stage 1 = importaciones (8 videos). Stage 2 = armar tienda online (3 videos: Tienda Nube, Shopify, ambas con Claude Code). |
| Early adopter | Quien se anota en la lista de espera durante la Fase 1 (landing). Recibe 10% de descuento de por vida sobre el precio del nivel elegido. |
| Traxcargo | Sistema externo de tracking de envíos al que la plataforma planea enlazar (no reconstruir) para el módulo de tracking. |

## 5. Flujos clave

### 5.1 Flujo de venta (planeado, Fase 2+)

Usuario ve la landing → elige nivel → registro (email+password o Google/Apple) → checkout → si paga con Mercado Pago: webhook confirma y activa el acceso automáticamente → si paga por transferencia o USDT: sube comprobante, queda en estado *pending*, un administrador lo confirma manualmente antes de activar el acceso (no hay automatización posible acá, es el punto de fricción operativa más grande del sistema).

### 5.2 Flujo de validación (Fase 1, lo que se construye ahora)

Usuario ve la landing (que presenta la plataforma como si ya existiera) → clic en "comprar" → en vez de checkout real, entra a una lista de espera con 10% off garantizado → se mide intención por nivel elegido. No hay pago real en esta fase. El objetivo explícito es no invertir en desarrollo de la plataforma completa hasta confirmar demanda (`resumen-ejecutivo.md` §7, Fase 1).

## 6. Decisiones estructurales y su justificación

| Decisión | Por qué |
|---|---|
| No hay panel de administración en el lanzamiento | Decisión explícita para no atrasar el timeline ajustado (lanzamiento agosto 2026). El programador actualiza contenido directo en código/config en vez de construir UI de admin. |
| Pagos por transferencia/USDT recomendados para posponer a una segunda etapa | Solo Mercado Pago es 100% automatizable vía webhook. Transferencia y USDT requieren confirmación manual, lo cual sin panel de admin implica un script sin interfaz — el brief técnico recomienda lanzar solo con MP para no bloquear el lanzamiento por esto. |
| La calculadora y el tracking se enlazan externos, no se reconstruyen | La calculadora ya existe y funciona en `vegroup.vercel.app/calculadora`. Traxcargo es un sistema de terceros. Reconstruir cualquiera de los dos no aporta valor y sí atrasa el lanzamiento. |
| Control de acceso por nivel vía Row-Level Security en la base, no en el frontend | Un check solo en frontend es evitable. RLS en Supabase garantiza que ni una consulta directa a la API devuelva contenido de un nivel no pagado. |
| Precios y niveles viven en variables de configuración, no hardcodeados | Se espera que cambien (ver conflicto 2 vs 3 niveles) y sin panel de admin, un cambio de precio no puede depender de un redeploy con código tocado a mano en el momento de cobrar. |
| Video en YouTube no listado para el lanzamiento, no Vimeo/Mux | Gratis y rápido de integrar. Migración a un host con más control anti-descarga queda para Fase 4 (post-tracción), cuando ya hay ingresos que lo justifiquen. |

## 7. Estado actual del proyecto

- Código de producción: no existe. El repositorio (`01-VeGroup-Emi`) tiene un único commit con 6 archivos, todos documentos/spec, ningún código de aplicación.
- Lo único en producción es la calculadora de costos, ya construida y viva en `vegroup.vercel.app/calculadora` (fuera de este repo).
- Fase activa: **Fase 1 — Validación**. Se va a construir la landing page descripta en detalle en `landing.md`. Nada de Fase 2 en adelante (registro, checkout, dashboard, comunidad, tracking) se construye todavía.
- Hay un prototipo HTML clickeable (`inicio-proyecto/app-preview_7.html`) de la plataforma completa (post-Fase 1) — sirve para ver estructura y flujo de pantallas, explícitamente no es código de producción para copiar.
- Hay bloqueantes de contenido (legal, números de prueba social, bio de Jota) y una decisión de producto sin cerrar (2 vs 3 niveles) que impiden avanzar de forma segura a Fase 2.

---

# Roadmap de 4 fases

## Fase 1 — Validación (fase activa hoy)

Se construye una landing page que presenta la plataforma completa: diseño, descripción de cada nivel, precios y botón de compra. El clic en "comprar" deriva a una lista de espera con 10% de descuento de early adopter, en vez de a un checkout real. Objetivo: confirmar demanda real antes de invertir en el desarrollo completo.

- Landing page que presenta la plataforma como si ya estuviera desarrollada
- Botón de compra que deriva a lista de espera (no a un checkout real)
- Formulario de lista de espera con 10% off para los primeros en anotarse
- Medición de clics, conversiones y nivel de interés por nivel de acceso

## Fase 2 — MVP para cobrar (condicional a resultados de Fase 1)

La versión más simple del producto que ya permite generar ingresos reales.

- Registro + login (email/contraseña + Google/Apple) y recuperación de contraseña
- Checkout con Mercado Pago automático vía webhook
- Panel de administración mínimo: activación de nivel y gestión de usuarios
- Dashboard básico con Stage 1 y Stage 2 (placeholders hasta que los videos estén listos)
- Enlace a la calculadora existente
- Directorio de agentes de compra en China
- Sección de profesionales al servicio
- Sección de servicios financieros
- Perfil básico: datos del usuario, nivel activo, accesos habilitados, soporte vía WhatsApp
- Páginas legales: Términos y Condiciones, Política de Privacidad, Política de Reembolsos (contenido lo entrega Jota)
- Emails transaccionales: bienvenida, confirmación de pago, reset de contraseña

**Nota de conflicto:** `brief-tecnico-programador.md` §8 (documento previo, con foco en el timeline ajustado) recorta esta lista aún más para un "Fase 1 — Lanzamiento imprescindible": deja OAuth social y comunidad con likes/comentarios para después. Si el timeline vuelve a apretar en el momento de construir esto, esa versión recortada es la referencia.

## Fase 3 — Primeros usuarios pagando

Con ingresos reales y primeros usuarios activos, se incorporan métodos de pago alternativos, herramientas operativas clave, y se completa el panel de administración.

- Transferencia bancaria y USDT como método de pago (confirmación manual vía panel)
- Flujo de upgrade entre niveles: el usuario paga la diferencia desde el panel
- Ticker superior con depósitos/CUIT y carga de packing list / proforma FOB
- Tracking de envíos vía enlace de Traxcargo
- Panel de administración completo: gestión de contenido, precios y pagos manuales

## Fase 4 — Post-tracción

Tracción = modelo de negocio probado (usuarios activos, pagos y demanda sostenida). Acá se invierte en features que mejoran experiencia y retención, no en validar si el negocio tiene sentido.

- Comunidad: feed, publicar y widget lateral de miembros activos
- Likes y comentarios en comunidad
- Video hosting definitivo (Vimeo o Mux) cuando los videos estén grabados
- Mejoras al panel de administración según necesidades operativas

## Regla de avance entre fases

El paso de Fase 1 a Fase 2 no es automático ni por fecha — depende de que se cumplan los umbrales de conversión definidos en `landing.md` §18 (Reglas de Negocio §5). Ninguna fase posterior a la 1 tiene fecha ni está garantizada todavía.
