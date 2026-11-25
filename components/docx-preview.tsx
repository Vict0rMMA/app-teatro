"use client";

import { useEffect, useRef, useState } from "react";
import { Spinner } from "./ui";

/**
 * El visor web no ubica bien las imágenes flotantes (wp:anchor): el logo del encabezado terminaba
 * encima del texto. Solo para mostrar, se convierten en imágenes en línea dentro de su casilla.
 * El archivo que se descarga no se toca.
 */
async function logosEnLinea(blob: Blob): Promise<Blob> {
  const { default: PizZip } = await import("pizzip");
  const zip = new PizZip(await blob.arrayBuffer());
  const parte = zip.file("word/document.xml");
  if (!parte) return blob;
  const xml = parte.asText();
  const nuevo = xml.replace(/<wp:anchor\b[^>]*>([\s\S]*?)<\/wp:anchor>/g, (todo, dentro: string) => {
    const pick = (re: RegExp) => re.exec(dentro)?.[0] ?? "";
    const extent = pick(/<wp:extent\b[^>]*\/>/);
    const graphic = pick(/<a:graphic\b[\s\S]*?<\/a:graphic>/);
    if (!extent || !graphic) return todo;
    const docPr = pick(/<wp:docPr\b[^>]*\/>/) || pick(/<wp:docPr\b[\s\S]*?<\/wp:docPr>/) || '<wp:docPr id="9000" name="Logo"/>';
    return `<wp:inline distT="0" distB="0" distL="0" distR="0">${extent}${docPr}${pick(/<wp:cNvGraphicFramePr\b[\s\S]*?(?:\/>|<\/wp:cNvGraphicFramePr>)/)}${graphic}</wp:inline>`;
  });
  if (nuevo === xml) return blob;
  zip.file("word/document.xml", nuevo);
  return zip.generate({ type: "blob", mimeType: blob.type || "application/vnd.openxmlformats-officedocument.wordprocessingml.document" });
}

/** Renderiza un .docx en pantalla con docx-preview (cargado solo cuando se usa). */
export function DocxPreview({ load }: { load: () => Promise<Blob> }) {
  const host = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"loading" | "ready" | "error">("loading");

  useEffect(() => {
    let cancelled = false;
    setState("loading");
    (async () => {
      try {
        const [{ renderAsync }, original] = await Promise.all([import("docx-preview"), load()]);
        const blob = await logosEnLinea(original).catch(() => original);
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
