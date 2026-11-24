"use client";

import { useRef, useState, type DragEvent } from "react";
import { IconUpload } from "./icons";
import { Spinner, cx } from "./ui";

const MAX = 10 * 1024 * 1024;

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
      onClick={() => !busy && input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && !busy && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        if (!busy) setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={drop}
      className={cx(
        "group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border border-dashed px-6 py-14 text-center transition-colors",
        over ? "border-brand bg-brand-soft/60" : "border-border bg-surface hover:border-fg/25 hover:bg-subtle/40",
        busy && "cursor-wait",
      )}
    >
      <div
        className={cx(
          "mb-4 grid h-11 w-11 place-items-center rounded-lg border bg-bg transition-transform",
          over ? "scale-105 border-brand/40 text-brand" : "border-border text-muted group-hover:text-fg",
        )}
      >
        {busy ? <Spinner /> : <IconUpload width={18} height={18} />}
      </div>
      {busy ? (
        <p className="text-sm font-medium">{busyLabel ?? "Procesando…"}</p>
      ) : (
        <>
          <p className="text-sm font-medium">
            Arrastra el registro de personal o <span className="text-brand">elígelo</span>
          </p>
          <p className="mt-1 text-[13px] text-muted">.docx o .pdf · máximo 10 MB</p>
        </>
      )}
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
