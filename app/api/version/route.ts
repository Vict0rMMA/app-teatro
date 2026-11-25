import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/** Versión desplegada (se fija al compilar). El cliente la compara con la suya para actualizarse solo. */
export function GET() {
  return NextResponse.json({ v: process.env.NEXT_PUBLIC_BUILD_ID ?? "dev" }, { headers: { "Cache-Control": "no-store" } });
}
