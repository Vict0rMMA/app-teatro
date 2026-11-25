import Anthropic from "@anthropic-ai/sdk";
import { NextResponse } from "next/server";
import { HttpError, handleError, rateLimit, requireUser } from "@/lib/api";
import { validar, type Extraccion } from "@/lib/cuenta-cobro";
import { SYSTEM_PROMPT } from "@/lib/prompt";
import { comparar, sanearRegistros } from "@/lib/registros";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const MODEL = process.env.ANTHROPIC_MODEL ?? "claude-sonnet-5-5";
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
    if (!process.env.ANTHROPIC_API_KEY) throw new HttpError(503, "Falta configurar ANTHROPIC_API_KEY en el servidor.", "SIN_IA");
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

    const content: Anthropic.Beta.BetaContentBlockParam[] = [];
    if (imagen) content.push({ type: "image", source: { type: "base64", media_type: imagen.mediaType, data: imagen.base64 } });
    content.push({
      type: "text",
      text: [
        body.persona ? `Persona: ${body.persona.slice(0, 120)}` : "Persona: la única que aparece en el consolidado.",
        texto ? `Consolidado pegado:\n${texto}` : "Consolidado en la imagen adjunta.",
      ].join("\n\n"),
    });

    let raw: string;
    try {
      const res = await new Anthropic().beta.messages.create({
        model: MODEL,
        max_tokens: 16000,
        // Transcribir una tabla no necesita razonamiento largo; "low" mantiene la respuesta dentro de los 60 s de Vercel.
        output_config: { effort: "low" },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        system: SYSTEM_PROMPT,
        messages: [{ role: "user", content }],
      });
      if (res.stop_reason === "refusal") throw new Error("El modelo no procesó la solicitud.");
      if (res.stop_reason === "max_tokens") throw new Error("Respuesta cortada: el consolidado es demasiado largo.");
      raw = res.content.flatMap((b) => (b.type === "text" ? [b.text] : [])).join("");
    } catch (e) {
      console.error("[cuenta-cobro]", e);
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
