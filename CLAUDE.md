# Convenciones del equipo (3 devs junior)

Este archivo se carga automático en cada sesión de Claude Code. Sirve como red de seguridad para lo que los hooks no pueden forzar.

## Checklist manual — antes de mergear cualquier feature

1. **¿Es una feature nueva (no un fix chico)?** → tiene que existir un spec hecho con `/write-spec` antes de escribir código.
2. **¿Hay UI nueva o modificada?** → correr `/design-critique` sobre la pantalla/mockup antes de darla por terminada.
3. **¿Tocaste componentes visuales compartidos (botones, inputs, cards, etc.)?** → correr `/design-system` para mantener consistencia.
4. **Antes de abrir PR** → correr `/simplify` sobre el código nuevo (limpieza de reuse/eficiencia; no reemplaza el code-review automático del commit, es un pase extra de calidad).
5. **Si el proyecto cambia de forma significativa (nuevo módulo grande, nueva convención)** → actualizar este CLAUDE.md con `/init` o a mano.

## MCP servers

Configurados en `.mcp.json` (se commitea, es compartido para todo el equipo):

- **plane** — documentación y tracking de trabajo. Conexión OAuth remota, sin API keys en el repo. La primera vez que Claude Code lo detecte va a pedir loguearse con la cuenta de Plane de cada uno. Requiere Node.js 22+.
- **supabase** — acceso a la base de datos/backend (migraciones, logs, advisors de seguridad). Conexión OAuth remota, sin tokens en el repo. Cada uno se loguea con su cuenta de Supabase y selecciona la organización/proyecto la primera vez. Por defecto tiene permisos completos (puede aplicar migraciones); si en algún momento quieren un modo más seguro para juniors, se puede acotar agregando `?read_only=true` a la URL en `.mcp.json`.

