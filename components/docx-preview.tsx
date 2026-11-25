"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";

/** Renderiza un .docx en pantalla con docx-preview (cargado solo cuando se usa). */
export function DocxPreview({ load }: { load: () => Promise<Blob> }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const [{ renderAsync }, blob] = await Promise.all([import("docx-preview"), load()]);
        if (cancelled || !host.current) return;
        host.current.innerHTML = "";
        await renderAsync(blob, host.current, undefined, {
          inWrapper: true,
          ignoreLastRenderedPageBreak: true,
          breakPages: true,
          experimental: true,
        });
        if (!cancelled) setState("ready");
      } catch {
        if (!cancelled) setState("error");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [load]);

  return (
    <div className="relative min-h-[300px] overflow-x-auto rounded-box bg-subtle">
      {state === "loading" && (
        <div className="absolute inset-0 grid place-items-center text-muted">
          <Spinner />
        </div>
      )}
      {state === "error" && <p className="p-6 text-center text-sm text-muted">No se pudo previsualizar. Descarga el archivo para verlo en Word.</p>}
      <div ref={host} className="docx-preview-host origin-top-left" />
    </div>
  );
}
