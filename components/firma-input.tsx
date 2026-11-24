"use client";

import { useEffect, useRef, useState } from "react";
import { IconTrash, IconUpload } from "./icons";
import { Button, cx } from "./ui";

/**
 * Convierte la imagen elegida (PNG/JPG) a PNG, la reduce a máx. 600 px de ancho y
 * vuelve transparente el fondo casi blanco para que la firma se vea limpia en Word.
 */
export async function prepararFirma(file: File): Promise<Blob> {
  if (!/^image\/(png|jpeg)$/.test(file.type)) throw new Error("La firma debe ser PNG o JPG.");
  if (file.size > 5 * 1024 * 1024) throw new Error("La imagen supera 5 MB.");
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, 600 / bitmap.width);
  const w = Math.max(1, Math.round(bitmap.width * scale));
  const h = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  ctx.drawImage(bitmap, 0, 0, w, h);
  const img = ctx.getImageData(0, 0, w, h);
  for (let i = 0; i < img.data.length; i += 4) {
    const lum = (img.data[i] + img.data[i + 1] + img.data[i + 2]) / 3;
    if (lum > 235) img.data[i + 3] = 0;
  }
  ctx.putImageData(img, 0, 0);
  const blob = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
  if (!blob) throw new Error("No se pudo procesar la imagen.");
  if (blob.size > 1024 * 1024) throw new Error("La firma procesada supera 1 MB; usa una imagen más pequeña.");
  return blob;
}

export function FirmaInput({
  currentUrl,
  value,
  onChange,
  onRemove,
  onError,
}: {
  currentUrl?: string | null;
  value: Blob | null;
  onChange: (b: Blob) => void;
  onRemove?: () => void;
  onError: (msg: string) => void;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<string | null>(null);

  useEffect(() => {
    if (!value) return setPreview(null);
    const url = URL.createObjectURL(value);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [value]);

  const shown = preview ?? currentUrl ?? null;

  async function pick(file?: File) {
    if (!file) return;
    try {
      onChange(await prepararFirma(file));
    } catch (e) {
      onError((e as Error).message);
    }
  }

  return (
    <div className="flex items-center gap-3">
      <button
        type="button"
        onClick={() => input.current?.click()}
        className={cx(
          "grid h-20 w-40 shrink-0 place-items-center overflow-hidden rounded-md border bg-white",
          shown ? "border-border" : "border-dashed border-border text-faint hover:border-fg/30",
        )}
        aria-label="Elegir imagen de la firma"
      >
        {shown ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={shown} alt="Firma" className="max-h-16 max-w-[140px] object-contain" />
        ) : (
          <IconUpload className="text-zinc-400" />
        )}
      </button>
      <div className="flex flex-col gap-1.5">
        <Button type="button" size="sm" onClick={() => input.current?.click()}>
          {shown ? "Cambiar" : "Subir firma"}
        </Button>
        {shown && onRemove && (
          <Button type="button" size="sm" variant="ghost" icon={<IconTrash />} onClick={onRemove}>
            Quitar
          </Button>
        )}
        <p className="text-xs text-faint">PNG o JPG, fondo blanco.</p>
      </div>
      <input
        ref={input}
        type="file"
        accept="image/png,image/jpeg"
        className="hidden"
        onChange={(e) => {
          pick(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
