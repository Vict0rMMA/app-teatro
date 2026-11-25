import { GoogleGenAI, type Part } from "@google/genai";
import { NextResponse } from "next/server";
import { HttpError, handleError, rateLimit, requireUser } from "@/lib/api";
import { validar, type Extraccion } from "@/lib/cuenta-cobro";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { comparar, sanearRegistros } from "@/lib/registros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.GEMINI_MODEL || "gemini-3.8-flash";
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

    let raw: string;
    try {
      const res = await new GoogleGenAI({ apiKey }).models.generateContent({
        model: MODEL,
        contents: [{ role: "user", parts }],
        config: {
          systemInstruction: SYSTEM_PROMPT,
          responseMimeType: "application/json",
          temperature: 0,
        },
      });
      raw = res.text ?? "";
      if (!raw) throw new Error(`Respuesta vacía (${res.candidates?.[0]?.finishReason ?? "sin motivo"}).`);
    } catch (e) {
      console.error("[cuenta-cobro]", e);
      const status = (e as { status?: number }).status;
      if (status === 400 || status === 401 || status === 403)
        throw new HttpError(502, "Gemini rechazó la clave o el modelo. Revisa GEMINI_API_KEY y GEMINI_MODEL en Vercel.", "IA_CLAVE");
      if (status === 429) throw new HttpError(429, "Se acabó la cuota de Gemini por ahora. Intenta en un rato.", "IA_CUOTA");
      throw new HttpError(502, "No se pudo procesar el consolidado. Intenta con una imagen más nítida o pega el texto.", "IA");
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
