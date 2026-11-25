"use client";

import { usePathname } from "next/navigation";
import { useEffect, useRef, useState } from "react";

const MI_VERSION = process.env.NEXT_PUBLIC_BUILD_ID ?? "dev";
const CADA_MS = 60_000;
/** Páginas con trabajo a medio llenar: ahí nunca se recarga sola. */
const CON_BORRADOR = ["/", "/cuenta-cobro"];

function ocupado(pathname: string) {
  if (CON_BORRADOR.includes(pathname)) return true;
  const el = document.activeElement;
  if (el && /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName)) return true;
  return !!document.querySelector("dialog[open]");
}

/**
 * Cuando sale una versión nueva de la app, se recarga sola sin F5. Si hay algo a medio llenar,
 * en vez de recargar muestra un aviso con "Actualizar".
 */
export function Actualizador() {
  const pathname = usePathname();
  const [nueva, setNueva] = useState(false);
  const ruta = useRef(pathname);
  ruta.current = pathname;

  useEffect(() => {
    if (process.env.NODE_ENV !== "production" || MI_VERSION === "dev") return;
    let cancelado = false;

    const revisar = async () => {
      if (document.visibilityState !== "visible") return;
      try {
        const r = await fetch("/api/version", { cache: "no-store" });
        const { v } = (await r.json()) as { v: string };
        if (cancelado || !v || v === "dev" || v === MI_VERSION) return;
        if (ocupado(ruta.current)) setNueva(true);
        else window.location.reload();
      } catch {
        /* sin conexión: se intenta en la próxima vuelta */
      }
    };

    const id = window.setInterval(revisar, CADA_MS);
    const alVolver = () => document.visibilityState === "visible" && void revisar();
    document.addEventListener("visibilitychange", alVolver);
    window.addEventListener("focus", alVolver);
    void revisar();
    return () => {
      cancelado = true;
      window.clearInterval(id);
      document.removeEventListener("visibilitychange", alVolver);
      window.removeEventListener("focus", alVolver);
    };
  }, []);

  // Si había un aviso pendiente y pasa a una página sin borrador, se actualiza sola.
  useEffect(() => {
    if (nueva && !ocupado(pathname)) window.location.reload();
  }, [nueva, pathname]);

  if (!nueva) return null;
  return (
    <div
      role="status"
      className="fixed inset-x-3 bottom-[calc(72px+env(safe-area-inset-bottom))] z-[70] mx-auto flex max-w-sm animate-toast-in items-center justify-between gap-3 rounded-box border border-border bg-surface px-4 py-3 text-[13px] shadow-pop md:bottom-4"
    >
      <span>Hay una versión nueva de la app.</span>
      <button onClick={() => window.location.reload()} className="shrink-0 font-medium text-brand underline-offset-2 hover:underline">
        Actualizar
      </button>
    </div>
  );
}
