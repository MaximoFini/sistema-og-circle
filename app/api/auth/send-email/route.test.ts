import { Webhook } from "standardwebhooks";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Lo que se testea acá es la propiedad de seguridad del endpoint: una firma que
 * no verifica NO produce ningún email. El endpoint es una superficie pública, y
 * sin esta garantía cualquiera podría hacer que la plataforma mande mails con
 * nuestro remitente y links arbitrarios.
 *
 * La firma se genera con la librería real (`standardwebhooks`), no con un mock:
 * mockear la verificación testearía el mock, no la protección.
 *
 * `enviarEmail` y la plantilla SÍ están mockeados, con factory, para que el test
 * no le pegue a la red ni tenga que renderizar JSX (vitest corre en
 * `environment: "node"` y este archivo es `.ts` a propósito).
 */

const mockEnviarEmail = vi.fn();

vi.mock("@/lib/email/send", () => ({
  enviarEmail: (...args: unknown[]) => mockEnviarEmail(...args),
  reportarFalloDeEmail: () => {},
}));

// La plantilla mockeada devuelve sus propias props para poder afirmar sobre la
// URL de reset que se le arma (sin renderizar JSX).
vi.mock("@/emails/reset-password", () => ({
  ResetPasswordEmail: (props: { url: string; codigo?: string }) => ({ type: "mock", props }),
}));

function urlDelUltimoEnvio(): string {
  return (mockEnviarEmail.mock.calls[0][0] as { plantilla: { props: { url: string } } }).plantilla
    .props.url;
}

const SECRETO_BASE64 = Buffer.from("secreto-de-prueba-vgrp-25").toString("base64");
const SECRETO_COMO_LO_DA_SUPABASE = `v1,whsec_${SECRETO_BASE64}`;

const PAYLOAD = JSON.stringify({
  user: { email: "usuario@ejemplo.com" },
  email_data: {
    token: "123456",
    token_hash: "hash-de-un-solo-uso",
    redirect_to: "https://vegroup.vercel.app/dashboard",
    email_action_type: "recovery",
    site_url: "https://vegroup.vercel.app",
  },
});

function pedido(headers: Record<string, string>, cuerpo = PAYLOAD): Request {
  return new Request("https://vegroup.vercel.app/api/auth/send-email", {
    method: "POST",
    headers,
    body: cuerpo,
  });
}

function headersFirmados(): Record<string, string> {
  const id = "msg_vgrp25";
  const timestamp = new Date();
  const firma = new Webhook(SECRETO_BASE64).sign(id, timestamp, PAYLOAD);
  return {
    "webhook-id": id,
    "webhook-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
    "webhook-signature": firma,
  };
}

describe("POST /api/auth/send-email", () => {
  beforeEach(() => {
    // El `await import("./route")` de cada test tiene que traer el módulo fresco:
    // sin esto Vitest cachea la primera instancia y los `stubEnv` de un test
    // podrían no verse en el siguiente (hoy funciona porque las env vars se leen
    // dentro de las funciones, pero es una garantía que no queremos que dependa
    // de eso).
    vi.resetModules();
    mockEnviarEmail.mockReset();
    mockEnviarEmail.mockResolvedValue({ ok: true, id: "id-de-prueba" });
    vi.stubEnv("SEND_EMAIL_HOOK_SECRET", SECRETO_COMO_LO_DA_SUPABASE);
    vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://hsmodrhbwkromoixrxrt.supabase.co");
  });

  afterEach(() => {
    vi.unstubAllEnvs();
  });

  it("responde 401 y no manda ningún email si la firma es inválida", async () => {
    const { POST } = await import("./route");
    const headers = headersFirmados();

    const respuesta = await POST(
      pedido({ ...headers, "webhook-signature": "v1,firmaFalsificadaAAAAAAAAAAAAAAAAAAAAAA=" }),
    );

    expect(respuesta.status).toBe(401);
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("responde 401 y no manda ningún email si no vienen los headers de firma", async () => {
    const { POST } = await import("./route");

    const respuesta = await POST(pedido({ "content-type": "application/json" }));

    expect(respuesta.status).toBe(401);
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("responde 401 si el payload fue alterado después de firmarse", async () => {
    const { POST } = await import("./route");
    const headers = headersFirmados();
    const alterado = PAYLOAD.replace("usuario@ejemplo.com", "atacante@ejemplo.com");

    const respuesta = await POST(pedido(headers, alterado));

    expect(respuesta.status).toBe(401);
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("responde 500 y no manda nada si falta el secreto en el entorno", async () => {
    vi.stubEnv("SEND_EMAIL_HOOK_SECRET", "");
    const { POST } = await import("./route");

    const respuesta = await POST(pedido(headersFirmados()));

    expect(respuesta.status).toBe(500);
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("responde 500 (no 401) si el secreto tiene formato inválido — diagnóstico honesto", async () => {
    vi.stubEnv("SEND_EMAIL_HOOK_SECRET", "v1,whsec_no-es-base64-valido-%%%");
    vi.spyOn(console, "error").mockImplementation(() => {});
    const { POST } = await import("./route");

    const respuesta = await POST(pedido(headersFirmados()));

    // Un secreto mal configurado no es "firma inválida": si devolviera 401,
    // quien está registrando el hook creería que el problema es de Supabase.
    expect(respuesta.status).toBe(500);
    expect(mockEnviarEmail).not.toHaveBeenCalled();
    vi.restoreAllMocks();
  });

  it("con firma válida, manda el reset al usuario del payload", async () => {
    const { POST } = await import("./route");

    const respuesta = await POST(pedido(headersFirmados()));

    expect(respuesta.status).toBe(200);
    expect(mockEnviarEmail).toHaveBeenCalledTimes(1);
    expect(mockEnviarEmail.mock.calls[0][0]).toMatchObject({
      para: "usuario@ejemplo.com",
      motivo: "reset-password",
    });
  });

  it("descarta un redirect_to a otro origen y cae a site_url (open redirect)", async () => {
    const { POST } = await import("./route");

    const cuerpo = JSON.stringify({
      user: { email: "usuario@ejemplo.com" },
      email_data: {
        token: "123456",
        token_hash: "hash",
        redirect_to: "https://og-circIe-phishing.com/robar",
        email_action_type: "recovery",
        site_url: "https://vegroup.vercel.app",
      },
    });
    const id = "msg_redirect";
    const timestamp = new Date();
    const firma = new Webhook(SECRETO_BASE64).sign(id, timestamp, cuerpo);

    await POST(
      pedido(
        {
          "webhook-id": id,
          "webhook-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
          "webhook-signature": firma,
        },
        cuerpo,
      ),
    );

    const url = urlDelUltimoEnvio();
    expect(url).not.toContain("phishing");
    expect(new URL(url).searchParams.get("redirect_to")).toBe("https://vegroup.vercel.app");
  });

  it("conserva un redirect_to del mismo origen que site_url", async () => {
    const { POST } = await import("./route");

    await POST(pedido(headersFirmados()));

    expect(new URL(urlDelUltimoEnvio()).searchParams.get("redirect_to")).toBe(
      "https://vegroup.vercel.app/dashboard",
    );
  });

  it("rechaza los tipos de email que todavía no tienen plantilla, en vez de fallar callado", async () => {
    const { POST } = await import("./route");

    const cuerpo = JSON.stringify({
      user: { email: "usuario@ejemplo.com" },
      email_data: {
        token: "123456",
        token_hash: "hash",
        redirect_to: "",
        email_action_type: "signup",
        site_url: "https://vegroup.vercel.app",
      },
    });
    const id = "msg_signup";
    const timestamp = new Date();
    const firma = new Webhook(SECRETO_BASE64).sign(id, timestamp, cuerpo);

    const respuesta = await POST(
      pedido(
        {
          "webhook-id": id,
          "webhook-timestamp": Math.floor(timestamp.getTime() / 1000).toString(),
          "webhook-signature": firma,
        },
        cuerpo,
      ),
    );

    expect(respuesta.status).toBe(400);
    expect(mockEnviarEmail).not.toHaveBeenCalled();
  });

  it("responde 500 si el envío falla — el email es el único propósito de este request", async () => {
    mockEnviarEmail.mockResolvedValue({ ok: false, error: "resend caído" });
    const { POST } = await import("./route");

    const respuesta = await POST(pedido(headersFirmados()));

    expect(respuesta.status).toBe(500);
  });
});
