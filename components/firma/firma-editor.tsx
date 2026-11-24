"use client";

import { useEffect, useRef, useState } from "react";
import { IconCheck, IconTrash, IconUpload } from "../icons";
import { Button, Spinner, cx } from "../ui";
import { FIRMA_MAX_BYTES, loadImage, removeBackground, trimAndScale } from "./image-tools";
import { SignatureCanvas, type SignatureCanvasHandle } from "./signature-canvas";

const checker =
  "bg-[length:16px_16px] bg-[linear-gradient(45deg,#f1f1f3_25%,transparent_25%),linear-gradient(-45deg,#f1f1f3_25%,transparent_25%),linear-gradient(45deg,transparent_75%,#f1f1f3_75%),linear-gradient(-45deg,transparent_75%,#f1f1f3_75%)] bg-[position:0_0,0_8px,8px_-8px,-8px_0] bg-white";

function Preview({ blob }: { blob: Blob }) {
  const [url, setUrl] = useState<string>();
  useEffect(() => {
    const u = URL.createObjectURL(blob);
    setUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [blob]);
  return (
    <div className={cx("grid h-36 place-items-center rounded-lg border border-border p-3", checker)}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      {url && <img src={url} alt="Vista previa de la firma" className="max-h-full max-w-full object-contain" />}
    </div>
  );
}

/**
 * Dibujar o subir la firma. `onSave` recibe un PNG transparente y recortado.
 * Se usa en el onboarding, en Ajustes y para "Firmar este evento".
 */
export function FirmaEditor({
  onSave,
  onCancel,
  saveLabel = "Guardar firma",
}: {
  onSave: (png: Blob) => Promise<void> | void;
  onCancel?: () => void;
  saveLabel?: string;
}) {
  const [tab, setTab] = useState<"dibujar" | "subir">("dibujar");
  const [preview, setPreview] = useState<Blob | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!preview) return;
    setSaving(true);
    try {
      await onSave(preview);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div role="tablist" className="mb-4 inline-flex rounded-md border border-border bg-subtle p-0.5 text-[13px]">
        {(["dibujar", "subir"] as const).map((t) => (
          <button
            key={t}
            role="tab"
            aria-selected={tab === t}
            onClick={() => {
              setTab(t);
              setPreview(null);
              setError(null);
            }}
            className={cx("rounded px-3 py-1", tab === t ? "bg-surface font-medium text-fg shadow-card" : "text-muted hover:text-fg")}
          >
            {t === "dibujar" ? "Dibujar" : "Subir imagen"}
          </button>
        ))}
      </div>

      {preview ? (
        <div className="animate-fade-up space-y-3">
          <p className="text-[13px] text-muted">Así se verá en las planillas (fondo transparente).</p>
          <Preview blob={preview} />
          <div className="flex flex-wrap justify-end gap-2">
            <Button onClick={() => setPreview(null)}>Volver a editar</Button>
            <Button variant="primary" icon={<IconCheck />} loading={saving} onClick={save}>
              {saveLabel}
            </Button>
          </div>
        </div>
      ) : tab === "dibujar" ? (
        <DrawTab onReady={setPreview} onCancel={onCancel} />
      ) : (
        <UploadTab onReady={setPreview} onError={setError} onCancel={onCancel} />
      )}
      {error && <p className="mt-2 text-xs text-danger">{error}</p>}
    </div>
  );
}

function DrawTab({ onReady, onCancel }: { onReady: (b: Blob) => void; onCancel?: () => void }) {
  const pad = useRef<SignatureCanvasHandle>(null);
  const [empty, setEmpty] = useState(true);
  const [busy, setBusy] = useState(false);

  return (
    <div className="space-y-3">
      <SignatureCanvas ref={pad} onChange={setEmpty} />
      <p className="text-xs text-faint">Firma con el dedo, el lápiz o el mouse. Con lápiz se ignora el roce de la palma.</p>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex gap-1">
          <Button size="sm" variant="ghost" onClick={() => pad.current?.undo()} disabled={empty}>
            Deshacer
          </Button>
          <Button size="sm" variant="ghost" icon={<IconTrash />} onClick={() => pad.current?.clear()} disabled={empty}>
            Borrar
          </Button>
        </div>
        <div className="flex gap-2">
          {onCancel && <Button onClick={onCancel}>Cancelar</Button>}
          <Button
            variant="primary"
            disabled={empty}
            loading={busy}
            onClick={async () => {
              setBusy(true);
              const png = await pad.current?.toPng();
              setBusy(false);
              if (png) onReady(png);
            }}
          >
            Continuar
          </Button>
        </div>
      </div>
    </div>
  );
}

function UploadTab({ onReady, onError, onCancel }: { onReady: (b: Blob) => void; onError: (m: string | null) => void; onCancel?: () => void }) {
  const camera = useRef<HTMLInputElement>(null);
  const gallery = useRef<HTMLInputElement>(null);
  const [source, setSource] = useState<HTMLCanvasElement | null>(null);
  const [threshold, setThreshold] = useState(200);
  const [processed, setProcessed] = useState<HTMLCanvasElement | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);

  async function pick(file?: File) {
    if (!file) return;
    onError(null);
    if (!/^image\/(png|jpe?g)$/i.test(file.type) && !/\.(png|jpe?g)$/i.test(file.name)) {
      return onError("La firma debe ser PNG o JPG.");
    }
    setLoading(true);
    try {
      setSource(await loadImage(file)); // redimensiona antes de procesar (fotos de cámara)
    } catch (e) {
      onError((e as Error).message);
    } finally {
      setLoading(false);
    }
  }

  // Vista previa en vivo al mover el umbral.
  useEffect(() => {
    if (!source) return;
    const t = setTimeout(() => {
      const c = removeBackground(source, threshold);
      setProcessed(c);
      setPreviewUrl(c.toDataURL("image/png"));
    }, 60);
    return () => clearTimeout(t);
  }, [source, threshold]);

  async function next() {
    if (!processed) return;
    setBusy(true);
    const png = await trimAndScale(processed, 800);
    setBusy(false);
    if (!png) return onError("No se ve ninguna firma: baja el umbral o usa una foto con más contraste.");
    if (png.size > FIRMA_MAX_BYTES) return onError("La firma procesada supera 150 KB. Usa una foto más nítida y de cerca.");
    onReady(png);
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <Button onClick={() => camera.current?.click()} icon={<IconUpload />}>
          Tomar foto
        </Button>
        <Button onClick={() => gallery.current?.click()} icon={<IconUpload />}>
          Elegir imagen
        </Button>
      </div>
      <input ref={camera} type="file" accept="image/*" capture="environment" className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />
      <input ref={gallery} type="file" accept="image/png,image/jpeg" className="hidden" onChange={(e) => (pick(e.target.files?.[0]), (e.target.value = ""))} />

      {loading ? (
        <div className="grid h-36 place-items-center rounded-lg border border-border text-muted">
          <Spinner />
        </div>
      ) : source ? (
        <>
          <div className={cx("grid h-40 place-items-center rounded-lg border border-border p-3", checker)}>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            {previewUrl && <img src={previewUrl} alt="Firma sin fondo" className="max-h-full max-w-full object-contain" />}
          </div>
          <label className="block">
            <span className="flex items-center justify-between text-[13px]">
              <span className="font-medium">Quitar fondo</span>
              <span className="tabular text-faint">{threshold}</span>
            </span>
            <input
              type="range"
              min={120}
              max={250}
              value={threshold}
              onChange={(e) => setThreshold(Number(e.target.value))}
              className="mt-2 w-full accent-[rgb(var(--brand))]"
              aria-label="Umbral para quitar el fondo"
            />
            <span className="mt-1 flex justify-between text-[11px] text-faint">
              <span>Menos</span>
              <span>Más</span>
            </span>
          </label>
        </>
      ) : (
        <p className="rounded-lg border border-dashed border-border px-4 py-8 text-center text-[13px] text-muted">
          Firma en una hoja blanca con tinta oscura y tómale una foto de cerca, o elige un PNG/JPG.
        </p>
      )}

      <div className="flex justify-end gap-2">
        {onCancel && <Button onClick={onCancel}>Cancelar</Button>}
        <Button variant="primary" disabled={!processed} loading={busy} onClick={next}>
          Continuar
        </Button>
      </div>
    </div>
  );
}
