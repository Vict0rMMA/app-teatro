import { HttpError } from "@/lib/api";

const TIMEOUT_MS = 45_000;
const DOCX_TYPE = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

/** Convierte el DOCX con LibreOffice mediante Gotenberg, conservando la paginación del archivo. */
export async function convertirDocxAPdf(docx: Uint8Array, nombre: string): Promise<Uint8Array> {
  const base = process.env.GOTENBERG_URL?.replace(/\/+$/, "");
  if (!base) throw new HttpError(503, "La conversión oficial a PDF aún no está configurada.", "PDF_NO_CONFIGURADO");
  if (process.env.NODE_ENV === "production" && (!process.env.GOTENBERG_USERNAME || !process.env.GOTENBERG_PASSWORD))
    throw new HttpError(503, "Faltan las credenciales privadas del conversor PDF.", "PDF_CONFIGURACION");

  let endpoint: URL;
  try {
    endpoint = new URL(`${base}/forms/libreoffice/convert`);
  } catch {
    throw new HttpError(503, "GOTENBERG_URL no es una dirección válida.", "PDF_CONFIGURACION");
  }
  if (!(["http:", "https:"].includes(endpoint.protocol)))
    throw new HttpError(503, "GOTENBERG_URL debe comenzar por http:// o https://.", "PDF_CONFIGURACION");

  const archivo = new FormData();
  archivo.append("files", new Blob([new Uint8Array(docx)], { type: DOCX_TYPE }), `${nombre}.docx`);
  const auth = process.env.GOTENBERG_USERNAME && process.env.GOTENBERG_PASSWORD
    ? `Basic ${Buffer.from(`${process.env.GOTENBERG_USERNAME}:${process.env.GOTENBERG_PASSWORD}`).toString("base64")}`
    : undefined;

  let respuesta: Response;
  try {
    respuesta = await fetch(endpoint, {
      method: "POST",
      body: archivo,
      headers: auth ? { Authorization: auth } : undefined,
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch (error) {
    console.error("[cuenta-cobro/pdf] conversor no disponible", (error as Error).name);
    throw new HttpError(502, "No se pudo conectar con el conversor de PDF. Intenta de nuevo.", "PDF_CONVERSOR");
  }

  if (!respuesta.ok) {
    console.error("[cuenta-cobro/pdf] conversor respondió", respuesta.status);
    throw new HttpError(502, "El conversor no pudo crear el PDF desde el formato seleccionado.", "PDF_CONVERSION");
  }
  if (!respuesta.headers.get("content-type")?.includes("application/pdf"))
    throw new HttpError(502, "El conversor no devolvió un PDF válido.", "PDF_RESPUESTA");

  return new Uint8Array(await respuesta.arrayBuffer());
}
