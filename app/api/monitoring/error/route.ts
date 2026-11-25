import { NextResponse } from "next/server";
import { z } from "zod";
import { sendErrorAlert } from "@/lib/error-alerts";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const schema = z.object({
  source: z.enum(["Pantalla", "Inicio de sesión", "Registro", "Google"]),
  message: z.string().min(1).max(500),
  code: z.string().max(100).optional(),
  stack: z.string().max(2000).optional(),
  path: z.string().max(200).optional(),
  digest: z.string().max(100).optional(),
});
const hits = new Map<string, { count: number; reset: number }>();

export async function POST(req: Request) {
  const origin = req.headers.get("origin");
  if (!origin || new URL(origin).origin !== new URL(req.url).origin) {
    return NextResponse.json({ ok: false }, { status: 403 });
  }
  const ip = (req.headers.get("x-forwarded-for") || "desconocido").split(",")[0].trim();
  const now = Date.now();
  const bucket = hits.get(ip);
  if (bucket && bucket.reset > now && bucket.count >= 5) return NextResponse.json({ ok: false }, { status: 429 });
  hits.set(ip, !bucket || bucket.reset <= now ? { count: 1, reset: now + 60 * 60 * 1000 } : { ...bucket, count: bucket.count + 1 });
  if (hits.size > 2000) for (const [key, value] of hits) if (value.reset <= now) hits.delete(key);

  const parsed = schema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ ok: false }, { status: 400 });
  await sendErrorAlert(parsed.data);
  return NextResponse.json({ ok: true });
}
