/** Mensajes en español para los códigos de Firebase Auth. */
export function authMessage(err: unknown): string {
  const code = (err as { code?: string })?.code ?? "";
  const map: Record<string, string> = {
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "No hay una cuenta con ese correo.",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo. Inicia sesión.",
    "auth/invalid-email": "El correo no es válido.",
    "auth/weak-password": "La contraseña debe tener al menos 8 caracteres.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
    "auth/network-request-failed": "Sin conexión. Revisa tu internet.",
    "auth/popup-closed-by-user": "Cerraste la ventana de inicio de sesión antes de terminar.",
    "auth/cancelled-popup-request": "Se canceló el inicio de sesión.",
    "auth/account-exists-with-different-credential": "Ese correo ya está registrado con otro método de ingreso.",
    "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase Auth.",
    "auth/operation-not-allowed": "Este método de ingreso aún no está activado.",
  };
  return map[code] ?? "No se pudo completar. Intenta de nuevo.";
}
