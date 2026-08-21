# CONTEXT.md — Contexto general

> Fuente: páginas de Plane "Contexto del Proyecto" y "Roadmap de 4 fases" (proyecto Sistema OG Circle, VGRP). Última sincronización: 2026-08-21.

**Estado del proyecto:** pre-desarrollo. No existe código de producción. Todo lo que hay hoy son documentos de especificación (versionados, con historial de decisiones) y un prototipo HTML clickeable de referencia. Este documento explica el *por qué* detrás de cada decisión registrada en esos documentos — el código todavía no existe, así que no hay un "qué" que leer.

## 1. Qué es OG Circle

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
