import "server-only";

const RESEND_URL = "https://api.resend.com/emails";
const MAX_TEXT = 1200;

function clean(value: unknown, max = MAX_TEXT) {
  return String(value ?? "")
    .replace(/\b(?:Bearer\s+)?[A-Za-z0-9_-]{30,}\b/g, "[oculto]")
    .replace(/\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/gi, "[correo oculto]")
    .slice(0, max);
}

export async function sendErrorAlert(details: {
  source: string;
  message: string;
  code?: string;
  stack?: string;
  path?: string;
  digest?: string;
}) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const to = (process.env.ERROR_ALERT_EMAIL || process.env.ADMIN_EMAIL)?.trim();
  const from = process.env.ERROR_ALERT_FROM?.trim();
  if (!apiKey || !to || !from) {
    console.error("[alerta] Correo no enviado: configura RESEND_API_KEY, ERROR_ALERT_EMAIL y ERROR_ALERT_FROM.");
    return;
  }

  const lines = [
    `Fecha: ${new Date().toISOString()}`,
    `Entorno: ${process.env.VERCEL_ENV || process.env.NODE_ENV || "desconocido"}`,
    `Origen: ${clean(details.source, 100)}`,
    details.path ? `Ruta: ${clean(details.path, 200)}` : "",
    details.code ? `Código: ${clean(details.code, 100)}` : "",
    `Error: ${clean(details.message)}`,
    details.digest ? `Referencia: ${clean(details.digest, 100)}` : "",
    details.stack ? `Detalle técnico:\n${clean(details.stack, 2500)}` : "",
  ].filter(Boolean);

  try {
    const response = await fetch(RESEND_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        from,
        to: [to],
        subject: `[Planillas Teatro] Error en ${clean(details.source, 100)}`,
        text: lines.join("\n"),
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!response.ok) console.error(`[alerta] El proveedor de correo respondió ${response.status}.`);
  } catch (error) {
    console.error("[alerta] No se pudo enviar el correo:", error instanceof Error ? error.message : "error desconocido");
  }
}
