# Convenciones del equipo (3 devs junior)

Este archivo se carga automático en cada sesión de Claude Code. Sirve como red de seguridad para lo que los hooks no pueden forzar.

## Automatizado (no depende de que nadie se acuerde)

Configurado en `.claude/settings.json`. Se dispara solo, siempre que el commit/push se haga **a través de Claude Code**:

- Antes de `git commit` → revisión de código automática (equivalente a `/code-review`) sobre el diff stageado.
- Antes de `git push` → revisión de seguridad automática (equivalente a `/security-review`) sobre los commits a subir. Si hay algo crítico, bloquea el push.

**Importante**: esto solo funciona si el commit/push se ejecuta desde una sesión de Claude Code. Si alguien corre `git push` en una terminal aparte, el hook no se dispara. Regla de equipo: **todo commit/push se hace a través de Claude Code**, no desde una terminal suelta.

## Checklist manual — antes de mergear cualquier feature

Esto no se puede forzar por hook porque depende de criterio, así que es checklist obligatoria:

1. **¿Es una feature nueva (no un fix chico)?** → tiene que existir un spec hecho con `/write-spec` antes de escribir código.
2. **¿Hay UI nueva o modificada?** → correr `/design-critique` sobre la pantalla/mockup antes de darla por terminada.
3. **¿Tocaste componentes visuales compartidos (botones, inputs, cards, etc.)?** → correr `/design-system` para mantener consistencia.
4. **Antes de abrir PR** → correr `/simplify` sobre el código nuevo (limpieza de reuse/eficiencia; no reemplaza el code-review automático del commit, es un pase extra de calidad).
5. **Si el proyecto cambia de forma significativa (nuevo módulo grande, nueva convención)** → actualizar este CLAUDE.md con `/init` o a mano.

## MCP servers

Configurados en `.mcp.json` (se commitea, es compartido para todo el equipo):

- **plane** — documentación y tracking de trabajo. Conexión OAuth remota, sin API keys en el repo. La primera vez que Claude Code lo detecte va a pedir loguearse con la cuenta de Plane de cada uno. Requiere Node.js 22+.
- **supabase** — acceso a la base de datos/backend (migraciones, logs, advisors de seguridad). Conexión OAuth remota, sin tokens en el repo. Cada uno se loguea con su cuenta de Supabase y selecciona la organización/proyecto la primera vez. Por defecto tiene permisos completos (puede aplicar migraciones); si en algún momento quieren un modo más seguro para juniors, se puede acotar agregando `?read_only=true` a la URL en `.mcp.json`.

No se agregaron MCPs de Figma ni de chat de equipo porque hoy no están en uso — se suman después si el equipo empieza a usarlos.

## Dueño de la configuración

Mientras el equipo se acomoda al flujo, los cambios a este archivo y a `.claude/settings.json` los mergea una sola persona designada, para evitar que las 3 personas diverjan en criterio. Revisar y ajustar esta sección cuando el equipo lo decida.
