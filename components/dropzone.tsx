"use client";

import { useRef, useState, type DragEvent } from "react";
import { Spinner, cx } from "./ui";

const MAX = 10 * 1024 * 1024;

/** Área grande para soltar el registro. Tipografía primero, sin icono decorativo. */
export function Dropzone({
  onFile,
  onError,
  busy,
  busyLabel,
}: {
  onFile: (f: File) => void;
  onError: (msg: string) => void;
  busy?: boolean;
  busyLabel?: string;
}) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  function accept(file?: File | null) {
    if (!file) return;
    if (!/\.(docx|pdf)$/i.test(file.name)) return onError("Solo se aceptan archivos .docx o .pdf.");
    if (file.size > MAX) return onError("El archivo supera el máximo de 10 MB.");
    if (file.size === 0) return onError("El archivo está vacío.");
    onFile(file);
  }

  function drop(e: DragEvent) {
    e.preventDefault();
    setOver(false);
    if (busy) return;
    accept(e.dataTransfer.files?.[0]);
  }

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={busy}
      aria-label="Subir el registro de personal"
      onClick={() => !busy && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cx(
        "flex min-h-[260px] cursor-pointer flex-col justify-between rounded-box border-[1.5px] border-dashed p-6 transition-colors duration-100 sm:min-h-[300px] sm:p-10",
        over ? "border-brand bg-brand-soft/50" : "border-border bg-surface hover:border-fg/30",
        busy && "cursor-wait",
      )}
    >
      {busy ? (
        <p className="flex items-center gap-3 font-bold tracking-tight text-2xl">
          <Spinner className="h-5 w-5 text-brand" /> {busyLabel ?? "Procesando…"}
        </p>
      ) : (
        <div>
          <p className="font-bold tracking-tight text-[26px] leading-tight sm:text-[32px]">{over ? "Suéltalo aquí" : "Arrastra el registro del evento"}</p>
          <p className="mt-2 text-sm text-muted">
            o <span className="font-medium text-brand underline decoration-brand/40 underline-offset-4">elige el archivo</span> en tu equipo
          </p>
        </div>
      )}
      <p className="mt-10 text-[12px] uppercase tracking-[0.06em] text-muted">.docx o .pdf · hasta 10 MB · no se guarda</p>
      <input
        ref={input}
        type="file"
        accept=".docx,.pdf,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
        className="hidden"
        onChange={(e) => {
          accept(e.target.files?.[0]);
          e.target.value = "";
        }}
      />
    </div>
  );
}
