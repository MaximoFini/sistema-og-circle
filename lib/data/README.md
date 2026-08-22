# lib/data

Placeholder. Esta carpeta va a contener los accessors tipados sobre las
tablas de Supabase (`profiles`, `pagos`, `admin_audit_log`, `leads`) que usa
el resto de la app — funciones como `getProfile(userId)`, `listPagosByUser`,
etc., construidas sobre los tipos de `lib/database.types.ts`.

Todavía no hay nada implementado acá: eso corresponde a otro ticket, posterior
a VGRP-15 (esquema + RLS) y VGRP-16 (auth hook / JWT / middleware). Esta
carpeta se crea ahora sólo para dejar la intención documentada.
