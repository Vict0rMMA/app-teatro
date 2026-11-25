import { GoogleGenAI, type Part } from "@google/genai";
import { NextResponse } from "next/server";
import { HttpError, handleError, rateLimit, requireUser } from "@/lib/api";
import { validar, type Extraccion } from "@/lib/cuenta-cobro";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { comparar, sanearRegistros } from "@/lib/registros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

/**
 * Modelos en orden. Si uno está saturado (503), sin cuota (429) o se demora, se pasa al siguiente.
 * Los "lite" responden en 2–6 s; con tope por intento la ruta no pasa de los 60 s de Vercel.
 */
const MODELOS = [...new Set([process.env.GEMINI_MODEL, "gemini-3.5-flash-lite", "gemini-3.1-flash-lite", "gemini-3.5-flash"].filter(Boolean) as string[])];
const TOPE_MS = [22_000, 15_000, 15_000];
const TIPOS_IMAGEN = ["image/png", "image/jpeg", "image/webp"] as const;
const MAX_IMAGEN_B64 = 7_000_000; // ~5 MB
const MAX_TEXTO = 50_000;

type Body = {
  texto?: string;
  imagen?: { base64: string; mediaType: (typeof TIPOS_IMAGEN)[number] };
  persona?: string; // nombre o cédula a filtrar
  /** registros personales del usuario: solo para comparar, nunca van a la IA */
  registros?: unknown;
};

function parseJson(raw: string): Extraccion {
  const limpio = raw.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  const ini = limpio.indexOf("{"), fin = limpio.lastIndexOf("}");
  if (ini < 0 || fin < ini) throw new Error("La IA no devolvió JSON.");
  const d = JSON.parse(limpio.slice(ini, fin + 1)) as Extraccion & { comparacion?: unknown };
  if (!Array.isArray(d.filas) || !d.persona || !d.mes || !d.anio) throw new Error("JSON incompleto.");
  d.alertas ??= [];
  delete d.comparacion; // la comparación la hace el código, no la IA
  return d;
}

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) throw new HttpError(503, "Falta configurar GEMINI_API_KEY en el servidor.", "SIN_IA");
    await rateLimit(user.uid, "cuenta-cobro", 20, 60 * 60 * 1000);

    const body = (await req.json().catch(() => null)) as Body | null;
    if (!body) throw new HttpError(400, "Cuerpo inválido.");

    const texto = body.texto?.trim();
    const imagen = body.imagen;
    if (!texto && !imagen) throw new HttpError(400, "Envía una imagen o pega el texto del Excel.");
    if (texto && texto.length > MAX_TEXTO) throw new HttpError(413, "Texto demasiado largo.");
    if (imagen) {
      if (!TIPOS_IMAGEN.includes(imagen.mediaType)) throw new HttpError(415, "Formato de imagen no soportado.");
      if (!imagen.base64 || imagen.base64.length > MAX_IMAGEN_B64) throw new HttpError(413, "Imagen vacía o mayor a 5 MB.");
    }

    const parts: Part[] = [];
    if (imagen) parts.push({ inlineData: { mimeType: imagen.mediaType, data: imagen.base64 } });
    parts.push({
      text: [
        body.persona ? `Persona: ${body.persona.slice(0, 120)}` : "Persona: la única que aparece en el consolidado.",
        texto ? `Consolidado pegado:\n${texto}` : "Consolidado en la imagen adjunta.",
      ].join("\n\n"),
    });

    const ai = new GoogleGenAI({ apiKey });
    let raw = "";
    let ultimoStatus: number | undefined;
    for (const [i, model] of MODELOS.slice(0, 3).entries()) {
      try {
        const res = await ai.models.generateContent({
          model,
          contents: [{ role: "user", parts }],
          config: {
            systemInstruction: SYSTEM_PROMPT,
            responseMimeType: "application/json",
            temperature: 0,
            abortSignal: AbortSignal.timeout(TOPE_MS[i] ?? 15_000),
            httpOptions: { timeout: TOPE_MS[i] ?? 15_000 },
          },
        });
        raw = res.text ?? "";
        if (raw) break;
        console.error("[cuenta-cobro] respuesta vacía", model, res.candidates?.[0]?.finishReason);
      } catch (e) {
        ultimoStatus = (e as { status?: number }).status;
        console.error("[cuenta-cobro]", model, ultimoStatus ?? (e as Error).name);
        if (ultimoStatus === 401 || ultimoStatus === 403)
          throw new HttpError(502, "Gemini rechazó la clave. Revisa GEMINI_API_KEY en Vercel.", "IA_CLAVE");
        // 503 saturado, 429 cuota, 404 modelo inexistente o tiempo agotado: probar el siguiente.
      }
    }
    if (!raw) {
      if (ultimoStatus === 429) throw new HttpError(429, "Se acabó la cuota de Gemini por ahora. Intenta en un rato.", "IA_CUOTA");
      throw new HttpError(502, "Gemini está saturado o no respondió. Intenta de nuevo en un momento.", "IA");
    }

    let datos: Extraccion;
    try {
      datos = parseJson(raw);
    } catch (e) {
      console.error("[cuenta-cobro] JSON", e);
      throw new HttpError(502, "La lectura del consolidado salió incompleta. Intenta de nuevo o pega el texto.", "IA_JSON");
    }

    const comparacion = comparar(datos.filas, sanearRegistros(body.registros), datos.mes, datos.anio);
    return NextResponse.json({ datos, validacion: validar(datos), comparacion });
  } catch (err) {
    return handleError(err);
  }
}
