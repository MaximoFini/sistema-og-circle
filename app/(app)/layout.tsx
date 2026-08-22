import type { ReactNode } from "react";

// Placeholder de layout para la plataforma privada. Sin auth/middleware
// todavía: eso es de un ticket dependiente de este bootstrap.
export default function AppLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
