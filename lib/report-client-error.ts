"use client";

export function reportClientError(details: {
  source: "Pantalla" | "Inicio de sesión" | "Registro" | "Google";
  message: string;
  code?: string;
  stack?: string;
  digest?: string;
}) {
  try {
    void fetch("/api/monitoring/error", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ...details, path: window.location.pathname }),
      keepalive: true,
    }).catch(() => undefined);
  } catch {
    // La notificación nunca debe interrumpir el manejo visual del error.
  }
}

const EXPECTED_AUTH_ERRORS = new Set([
  "auth/invalid-credential", "auth/wrong-password", "auth/user-not-found", "auth/invalid-email",
  "auth/email-already-in-use", "auth/weak-password", "auth/too-many-requests", "auth/network-request-failed",
  "auth/popup-closed-by-user", "auth/cancelled-popup-request",
]);

export function reportAuthFailure(source: "Inicio de sesión" | "Registro" | "Google", err: unknown) {
  const code = (err as { code?: string })?.code || "desconocido";
  if (EXPECTED_AUTH_ERRORS.has(code)) return;
  reportClientError({ source, code, message: "Firebase Auth falló por un error técnico.", stack: err instanceof Error ? err.stack : undefined });
}
