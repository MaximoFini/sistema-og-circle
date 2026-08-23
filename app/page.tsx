import { redirect } from "next/navigation";

// La landing pública vive en otro repo/deploy: este proyecto es sólo la
// plataforma privada, así que `/` no tiene contenido propio (hasta ahora
// devolvía 404).
//
// Se redirige a `/dashboard` y el resto lo resuelve `middleware.ts`: la
// decisión de sesión queda en un solo lugar, no duplicada acá.
//
// `/` está en `PUBLIC_ROUTES` del middleware justamente para que este
// `redirect()` corra siempre. No ahorra hops (el anónimo igual pasa por
// `/` → `/dashboard` → `/login`), pero hace que el `next` que se guarda sea
// `/dashboard` — el destino que de verdad quería — en vez de `/`, que al
// volver del login lo haría rebotar por acá una segunda vez.
export default function RootPage() {
  redirect("/dashboard");
}
