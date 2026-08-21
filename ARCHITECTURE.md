# ADR-001: Arquitectura de la plataforma OG Circle

**Estado:** Propuesta
**Fecha:** 2026-08-21
**Deciden:** Jota Vera (producto/negocio) + programador de la plataforma
**Ámbito:** Fase 2 en adelante (la plataforma privada). La landing de Fase 1 ya está en producción; esta ADR define cómo se integra, no cómo se rehace.

---

## 1. Contexto

### Lo que ya existe

- Una **landing en producción** (Next.js App Router en Vercel) con el primer backend real del proyecto: `app/api/demo/*`, IA de Anthropic, base NCM local de 4,3 MB, rate limiting con `@vercel/kv`, captura de leads.
- Una **calculadora de costos** viva en `vegroup.vercel.app/calculadora`, fuera de todo repo de la plataforma.
- Documentación de producto detallada (`CONTEXT.md`, `MODULOS.md`, `LANDING.md`, `DESIGN.md`).
- **Cero código de la plataforma privada.**

### Las fuerzas reales

| Fuerza | Consecuencia arquitectónica |
|---|---|
| Usuarios en Argentina, servidores por defecto en Virginia | La latencia geográfica es el problema de performance dominante, no el código |
| Decisión explícita de **no construir panel de admin** en el lanzamiento | El contenido y los precios tienen que ser editables sin UI propia y sin redeploy manual de código |
| El contenido (11 videos, 6 agentes, 4 profesionales, servicios) cambia **una vez cada varias semanas** | No hay razón para leerlo de una base de datos en cada pageview |
| Control de acceso por nivel, con contenido bloqueado **visible pero no accesible** | Hay que separar metadata pública de secretos server-only |
| Pago único, acceso de por vida, sin suscripción | El "entitlement" es un escalar que casi nunca cambia → cacheable de forma agresiva |
| Volumen realista: cientos a pocos miles de usuarios | El cuello de botella no va a ser la base. Va a ser la complejidad accidental |
| Timeline ajustado, un solo programador | Toda pieza de infraestructura tiene que justificar su costo de mantenimiento |

### El dato que ordena toda la decisión

La pantalla del día a día es el **Dashboard (Inicio)** — la más densa del producto. Su contenido es **idéntico para todos los usuarios del mismo nivel** y cambia rara vez. Lo único propio de cada usuario es: nivel activo, videos completados y envíos activos.

Eso no es una aplicación con base de datos. Es una **página estática con una capa fina por usuario encima**.

---

## 2. Decisión

Construir la plataforma como **"shell estático + claim de entitlement + overlay por usuario"**, dentro del **mismo repo y el mismo deploy que la landing**, con Supabase en São Paulo y funciones de Vercel en São Paulo.

Seis capas, cada una con una regla dura sobre dónde vive:

```
1. CONTENIDO      → módulos TypeScript en el repo, resueltos en build time
2. CONFIGURACIÓN  → Vercel Edge Config (precios, flags, links) — editable sin deploy
3. IDENTIDAD      → Supabase Auth, nivel como custom claim dentro del JWT
4. DATOS/USUARIO  → Postgres (Supabase), 1 fila por usuario, 1 query por sesión
5. ESCRITURAS     → Route Handlers idempotentes (webhook MP, progreso, leads)
6. AISLADO        → Demo IA, video (CDN externo), Comunidad, Tracking (Traxcargo)
```

Las cinco decisiones concretas que hacen que esto sea rápido:

**a) Regiones pegadas.** Proyecto Supabase en `sa-east-1` (São Paulo) y región de funciones de Vercel en `gru1` (São Paulo). Con la configuración por defecto (funciones en `iad1`, Virginia) cada query cruza el continente dos veces: ~200 ms por query, ~600 ms para tres. En la misma región son ~10 ms. Esto solo ya es la diferencia entre una app que "va" y una que vuela, y no cuesta una línea de código.

**b) El nivel viaja en el JWT, no en una query.** Un Auth Hook de Supabase escribe `app_metadata.nivel` al activarse el pago. Toda decisión de gating (middleware, server components, políticas RLS) lee el claim del token que ya viene en la cookie. **Cero roundtrips a la base para decidir qué mostrar.** Además, verificar el token localmente con claves asimétricas (ES256) en vez de llamar a `getUser()` evita un viaje al servidor de Auth en cada request — es el error de performance más común en Next.js + Supabase.

**c) El contenido no es data, es código.** `content/videos.ts`, `content/agentes.ts`, `content/profesionales.ts`, `content/servicios.ts`, tipados, con `nivel` en cada item. Se resuelven en build. Cambiar contenido = editar un archivo + push (deploy de Vercel ~60 s). Esto reemplaza al panel de admin de contenido que ya se decidió no construir, sin inventar una tabla ni una UI.

**d) Cada pieza de contenido tiene dos proyecciones.** `publicMeta` (nombre, título, teaser, nivel requerido) se prerenderiza y puede llegar al browser de cualquiera — es lo que permite mostrar la tarjeta bloqueada con su explicación, como pide la regla de UI de `MODULOS.md` §2. `secret` (contacto real del agente, dirección del depósito, datos SWIFT, ID del video) **nunca sale del servidor** salvo que el claim lo habilite. La regla en una línea: *la metadata es pública y estática; el secreto es server-only y gated por claim.*

**e) El dashboard se prerenderiza y el usuario se transmite en streaming.** El shell (todas las grillas de contenido, en sus dos variantes de nivel) sale del CDN. Las stats del usuario y el progreso llegan por `<Suspense>` desde una única query. Primer paint desde el PoP más cercano, no desde una base de datos.

> Nota de implementación: si usás Partial Prerendering, hoy sigue siendo una flag experimental de Next. El equivalente estable es segmento estático + `<Suspense>` con un componente dinámico adentro; el resultado práctico para el usuario es casi el mismo. No hagas depender el lanzamiento de una flag experimental.

---

## 3. Opciones consideradas

### Opción A — BaaS directo: cliente Supabase en el browser + RLS

Lo insinuado en el README actual: el frontend consulta Supabase directamente y RLS decide qué devuelve.

| Dimensión | Evaluación |
|---|---|
| Complejidad | Baja al principio, creciente |
| Costo | Bajo |
| Escalabilidad | Buena en escrituras, mala en latencia percibida |
| Familiaridad del equipo | Alta |

**A favor:** menos código, sin capa intermedia, RLS es una barrera real y auditable.
**En contra:** cada pantalla es una cascada de requests desde el browser del usuario (browser → Supabase, con TLS handshake incluido, sin poder cachear en CDN). El dashboard denso se vuelve un waterfall de 6-8 llamadas. Las policies RLS con subquery a `profiles` para leer el nivel se ejecutan **por fila**. Y todo el modelo de datos queda expuesto como superficie pública de API.

### Opción B — Shell estático + capa de acceso a datos en servidor + claims *(recomendada)*

Lo descripto en §2. RLS sigue existiendo, pero como **defensa en profundidad**, no como el mecanismo primario de lectura.

| Dimensión | Evaluación |
|---|---|
| Complejidad | Media-baja (una carpeta `lib/data/` disciplinada) |
| Costo | Bajo (el dashboard estático casi no invoca funciones) |
| Escalabilidad | Muy buena: el tráfico de lectura se sirve de CDN |
| Familiaridad del equipo | Alta (es Next.js idiomático) |

**A favor:** el camino caliente no toca la base. El gating es una comparación de string en memoria. El contenido secreto nunca se serializa al cliente. Un solo repo, un solo deploy, mismos tokens de diseño que la landing.
**En contra:** hay que ser disciplinado con la frontera server/client (un `'use client'` mal puesto filtra secretos). Cambiar contenido requiere un deploy — aceptable a esta frecuencia, molesto si algún día no lo es.

### Opción C — Backend propio desacoplado (NestJS/Fastify + Postgres gestionado)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Alta |
| Costo | Medio-alto (servidor siempre encendido + base + CI propio) |
| Escalabilidad | Excelente, e irrelevante a esta escala |
| Familiaridad del equipo | Media |

**A favor:** independencia de proveedor, control total, cero límites de plataforma.
**En contra:** duplica el trabajo (auth, migraciones, deploys, observabilidad) para un sistema que en su mejor escenario mueve unas pocas requests por segundo. Con un solo programador y timeline ajustado, es la forma más rápida de no llegar a la fecha.

### Opción D — Todo en el edge (Cloudflare Workers + Neon/D1)

| Dimensión | Evaluación |
|---|---|
| Complejidad | Alta (runtime restringido, ecosistema distinto) |
| Costo | Muy bajo |
| Escalabilidad | Excelente |
| Familiaridad del equipo | Baja |

**A favor:** latencia mínima global, costo casi nulo.
**En contra:** hay que reescribir la landing (Three.js, SDK de Anthropic, base NCM de 4,3 MB — mal encaje con los límites de bundle del edge). El edge optimiza para audiencia global; acá la audiencia es un solo país, y para eso una región bien elegida rinde igual y cuesta menos pensar.

---

## 4. Análisis de trade-offs

**Latencia: región > todo lo demás.** Ninguna optimización de código compensa un roundtrip transatlántico. Es la decisión de mayor impacto y menor costo de todo este documento. Si solo se implementa una cosa de esta ADR, que sea esta.

**RLS: mecanismo primario vs. red de seguridad.** `CONTEXT.md` §6 fija RLS como control de acceso, y la justificación es correcta — un check en frontend es evitable. Esta ADR **no contradice eso, lo refuerza**: RLS queda activo en todas las tablas, pero las policies leen el nivel **del JWT** (`auth.jwt() -> 'app_metadata' -> 'nivel'`), no de una subquery a `profiles`. Es más rápido *y* más seguro que la variante con subquery. El gating de contenido, además, ocurre antes: el secreto ni se lee, porque no está en la base — está en el bundle del servidor.

**Contenido en código vs. en base.** Meterlo en la base habilita un panel de admin que ya se decidió no construir, y paga latencia en cada pageview por una flexibilidad que nadie va a usar. En código es más rápido, tipado (el compilador atrapa un agente sin teléfono) y versionado. El costo es real: Jota no puede editar contenido solo. Mitigación: los campos que *sí* cambian bajo presión comercial — **precios, porcentaje de early adopter, flags de fase, links externos** — van a Edge Config, editable desde el dashboard de Vercel en segundos, sin tocar código. Eso cumple literalmente la decisión ya registrada de "precios en variables de configuración, no hardcodeados".

**Un repo o dos.** La landing ya vive sola y funciona. Aun así, la plataforma debería construirse **dentro de ese mismo repo**, como route group `(app)` junto a `(marketing)`: comparte tokens de diseño (`DESIGN.md` es un sistema, no un archivo suelto), comparte sesión sin CORS ni cookies cross-site, y es un deploy en vez de dos. Las páginas de la landing son estáticas: un cambio en la plataforma no puede romperlas. Dos repos solo se justifican si en algún momento hay dos personas desplegando con cadencias distintas.

**Pooling de conexiones — el modo clásico de morir.** Funciones serverless + Postgres agota conexiones bajo pico. Toda función tiene que ir por el pooler de Supabase en **modo transaction** (puerto 6543), nunca por la conexión directa. Es una línea en la connection string y la diferencia entre aguantar un pico de lanzamiento y caerse en él.

**Sobre la escalabilidad, con honestidad.** Con 10.000 usuarios pagos y 20 % activos por día son ~2.000 sesiones diarias: menos de 0,1 req/s de promedio, picos de unos pocos req/s. El plan más chico de Postgres lo aguanta sin transpirar, y con esta arquitectura la mayoría de esas sesiones ni siquiera lo tocan. El video sale por CDN de terceros (costo ~0 y escala infinita). **Este sistema no va a tener un problema de escala por años.** Los dos costos que sí escalan sin control son la **IA de la demo** (tráfico anónimo en la landing — ya acotada con cupo global diario, mantener eso) y las **invocaciones de funciones**, que esta arquitectura minimiza por diseño al servir el dashboard desde CDN. Diseñar hoy para un millón de usuarios sería pagar complejidad contra un riesgo que no existe.

---

## 5. Modelo de datos mínimo

```sql
profiles          -- 1 fila por usuario. La lectura del día a día.
  id uuid pk → auth.users, nombre, whatsapp,
  nivel enum('none','principiante','avanzado'),
  nivel_activado_at, progreso jsonb   -- ['s1-v1','s1-v2',...]

pagos             -- libro contable inmutable, auditable
  id, user_id, proveedor enum('mp','transferencia','usdt'),
  proveedor_ref text UNIQUE,          -- ← idempotencia del webhook
  nivel_comprado, monto, moneda,
  estado enum('pending','approved','rejected'),
  comprobante_path, raw jsonb, created_at

envios            -- Fase 3
posts/comentarios/likes  -- Fase 4, ruta aislada
leads             -- ya existe, de la demo de la landing
```

`profiles.nivel` es una **proyección materializada** de `pagos`, actualizada por trigger. Se conserva el ledger completo para auditoría y para el upgrade de $60.000, y a la vez la lectura caliente es una sola columna de una sola fila.

`progreso` como `jsonb` en `profiles` en vez de tabla aparte: el dashboard necesita nivel + progreso juntos, siempre. Una fila, una query. Cuando el progreso necesite analítica por video, se normaliza — no antes.

**Idempotencia del webhook de Mercado Pago:** `proveedor_ref UNIQUE` hace que los reintentos de MP sean inocuos. El webhook verifica la firma `x-signature` (HMAC) antes de tocar nada, responde 200 rápido y hace el trabajo en línea — a este volumen no hace falta cola.

---

## 6. Consecuencias

**Se vuelve más fácil**
- El dashboard carga desde CDN: percepción de instantáneo para el usuario argentino.
- Agregar contenido es editar un array tipado; el compilador atrapa los errores.
- Cambiar precios no requiere deploy ni panel de admin.
- El contenido de nivel Avanzado es inaccesible por construcción, no por un check que alguien puede olvidar.
- Los costos de infraestructura quedan cerca de planos hasta miles de usuarios.

**Se vuelve más difícil**
- Jota no puede editar contenido sin el programador (hasta Fase 3, que es cuando el roadmap ya prevé el panel).
- La frontera server/client exige disciplina: un `'use client'` mal ubicado puede filtrar un secreto. Se mitiga con la convención de que todo lo `secret` viva en archivos con `import 'server-only'`.
- Queda acoplamiento a Vercel (Edge Config, regiones, KV). Reversible, pero con trabajo.

**Hay que revisitar cuando**
- La comunidad (Fase 4) pase a ser el uso principal → deja de ser una app estática y necesita Realtime + paginación keyset, en su propia ruta para que no contamine el dashboard.
- El contenido cambie más de una vez por semana → mover contenido a base + `revalidateTag`.
- Aparezcan usuarios fuera de Argentina en volumen → revisar la elección de región única.
- Se sume una segunda persona desplegando → considerar separar los repos.

---

## 7. Action items

**Fase 1 (ahora, sobre la landing en producción)**
1. [ ] Fijar la región de funciones de Vercel en `gru1` y medir el antes/después en los endpoints de `/api/demo/*`.
2. [ ] Crear el proyecto Supabase en `sa-east-1` (São Paulo). **Irreversible sin migrar** — decidirlo ahora, no al empezar Fase 2.
3. [ ] Mover precios, % de early adopter y links externos (calculadora, wa.me, Traxcargo) a Vercel Edge Config.
4. [ ] Instrumentar la medición de conversión por nivel que exige la regla de avance de fase.

**Fase 2 (MVP para cobrar)**
5. [ ] Route group `(app)` en el repo de la landing, con su propio layout y middleware de sesión.
6. [ ] Supabase Auth + Auth Hook que inyecta `app_metadata.nivel` en el JWT; claves asimétricas y verificación local del token.
7. [ ] `content/*.ts` tipado, con la separación `publicMeta` / `secret` e `import 'server-only'` en los secretos.
8. [ ] Tablas `profiles` y `pagos` con RLS activo en ambas, policies leyendo el nivel desde `auth.jwt()`.
9. [ ] Webhook de MP: verificación de firma + `proveedor_ref` único + trigger que proyecta el nivel a `profiles`.
10. [ ] Connection string por el pooler en modo transaction (6543) en todas las funciones.
11. [ ] Dashboard: shell prerenderizado + `<Suspense>` para las stats del usuario.
12. [ ] Emails transaccionales (Resend) y páginas legales.

**Fase 3**
13. [ ] Panel de admin sobre el mismo modelo (el ledger `pagos` ya está listo para confirmación manual con comprobante).
14. [ ] Upgrade de nivel: inserta un `pago` nuevo por la diferencia; el trigger reproyecta el nivel. Sin lógica especial.

**Fase 4**
15. [ ] Comunidad en ruta aislada, Realtime + paginación keyset.
16. [ ] Migrar video a Mux/Vimeo detrás de una interfaz `VideoProvider` definida desde el día uno, para que el cambio sea de una sola pieza.
