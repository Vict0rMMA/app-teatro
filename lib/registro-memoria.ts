"use client";

/**
 * El REGISTRO completado lleva cédulas y teléfonos: no se guarda en ningún lado.
 * Vive solo en la memoria de esta pestaña para descargarlo en la pantalla de resultado.
 */
const store = new Map<string, { name: string; blob: Blob; alertas: string[]; sinFirma: boolean }>();

export function guardarRegistro(eventId: string, value: { name: string; blob: Blob; alertas: string[]; sinFirma: boolean }) {
  store.set(eventId, value);
}

export function leerRegistro(eventId: string) {
  return store.get(eventId) ?? null;
}

export function base64ToBlob(b64: string, type: string) {
  const bin = atob(b64);
  const bytes = new Uint8Array(bin.length);
  for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
  return new Blob([bytes], { type });
}
