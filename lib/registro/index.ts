import { parseRegistroDocx } from "./docx";
import { parseRegistroPdf } from "./pdf";
import { RegistroError, type Registro } from "./types";

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024;

export async function parseRegistro(fileName: string, buffer: Buffer): Promise<Registro> {
  const ext = fileName.toLowerCase().split(".").pop();
  if (buffer.length > MAX_UPLOAD_BYTES) {
    throw new RegistroError("ARCHIVO_INVALIDO", "El archivo supera el máximo de 10 MB.");
  }
  if (ext === "docx") return parseRegistroDocx(buffer);
  if (ext === "pdf") return parseRegistroPdf(buffer);
  throw new RegistroError("ARCHIVO_INVALIDO", "Solo se aceptan archivos .docx o .pdf.");
}

export * from "./types";
export { sanitizeRegistro } from "./build";
