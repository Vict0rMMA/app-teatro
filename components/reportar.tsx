"use client";

import { usePathname } from "next/navigation";
import { useState, type ClipboardEvent } from "react";
import { apiJson } from "@/lib/firebase/client";
import { IconAlert, IconPlus, IconX } from "./icons";
import { useToast } from "./toast";
import { Button, Modal, Textarea, cx } from "./ui";

const PAGINAS: Record<string, string> = {
  "/": "Nueva planilla",
  "/planillas": "Historial",
  "/horas": "Mis horas",
  "/cuenta-cobro": "Cuenta de cobro",
  "/ajustes": "Ajustes",
  "/admin": "Administración",
};

export const MAX_FOTOS = 2;
/** Tope por foto ya comprimida (base64). Dos caben de sobra en un documento de Firestore (1 MB). */
export const MAX_FOTO_B64 = 380_000;

function nombrePagina(path: string) {
  if (path.startsWith("/planillas/")) return "Detalle de planilla";
  return PAGINAS[path] ?? path;
}

/** Reduce la captura a JPEG liviano (legible, pero sin pasar del tope). */
async function comprimirFoto(file: Blob): Promise<string> {
  const bmp = await createImageBitmap(file);
  for (const [lado, calidad] of [
    [1400, 0.72],
    [1100, 0.62],
    [900, 0.55],
    [700, 0.5],
  ] as const) {
    const k = Math.min(1, lado / Math.max(bmp.width, bmp.height));
    const c = Object.assign(document.createElement("canvas"), {
      width: Math.round(bmp.width * k),
      height: Math.round(bmp.height * k),
    });
    c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
    const url = c.toDataURL("image/jpeg", calidad);
    if (url.length - 23 <= MAX_FOTO_B64) return url;
  }
  throw new Error("La imagen es demasiado grande.");
}

/** Botón "Reportar un problema": el mensaje (y hasta 2 fotos) le llega a la administradora. */
export function ReportarProblema({
  compacto,
  className,
}: {
  compacto?: boolean;
  className?: string;
}) {
  const pathname = usePathname();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [fotos, setFotos] = useState<string[]>([]);
  const [preparando, setPreparando] = useState(false);
  const [enviando, setEnviando] = useState(false);

  async function agregar(archivos: Blob[]) {
    const imagenes = archivos.filter((f) => f.type.startsWith("image/"));
    if (!imagenes.length) return;
    const libres = MAX_FOTOS - fotos.length;
    if (libres <= 0)
      return toast.error(
        `Máximo ${MAX_FOTOS} fotos`,
        "Quita una para agregar otra.",
      );
    setPreparando(true);
    try {
      const nuevas = await Promise.all(
        imagenes.slice(0, libres).map(comprimirFoto),
      );
      setFotos((f) => [...f, ...nuevas].slice(0, MAX_FOTOS));
      if (imagenes.length > libres)
        toast.info(`Solo se agregan ${MAX_FOTOS} fotos`);
    } catch {
      toast.error("No se pudo abrir esa imagen", "Prueba con otra captura.");
    } finally {
      setPreparando(false);
    }
  }

  function onPaste(e: ClipboardEvent) {
    const archivos = [...e.clipboardData.items]
      .filter((i) => i.type.startsWith("image/"))
      .map((i) => i.getAsFile()!)
      .filter(Boolean);
    if (archivos.length) {
      e.preventDefault();
      void agregar(archivos);
    }
  }

  async function enviar() {
    if (mensaje.trim().length < 5)
      return toast.error(
        "Cuéntanos un poco más",
        "Escribe qué pasó para poder arreglarlo.",
      );
    setEnviando(true);
    try {
      await apiJson("/api/reportes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          mensaje,
          pagina: nombrePagina(pathname),
          fotos: fotos.map((f) => f.split(",")[1]),
        }),
      });
      toast.success("Reporte enviado", "Gracias. Le llegó al administrador.");
      setMensaje("");
      setFotos([]);
      setAbierto(false);
    } catch (e) {
      toast.error("No se pudo enviar", (e as Error).message);
    } finally {
      setEnviando(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setAbierto(true)}
        aria-label="Reportar un problema"
        className={cx(
          compacto
            ? "grid h-10 w-10 place-items-center rounded-ctl text-muted transition-colors duration-100 active:bg-subtle hover:bg-subtle hover:text-fg"
            : "flex h-8 items-center gap-2.5 rounded-ctl px-3 text-[13px] text-faint transition-colors duration-100 hover:bg-subtle/60 hover:text-fg",
          className,
        )}
      >
        <IconAlert width={compacto ? 18 : 15} height={compacto ? 18 : 15} />
        {!compacto && "Reportar un problema"}
      </button>
      <Modal
        open={abierto}
        onClose={() => !enviando && setAbierto(false)}
        title="Reportar un problema"
        footer={
          <>
            <Button onClick={() => setAbierto(false)} disabled={enviando}>
              Cancelar
            </Button>
            <Button
              variant="primary"
              loading={enviando}
              disabled={preparando}
              onClick={enviar}
            >
              Enviar
            </Button>
          </>
        }
      >
        <div onPaste={onPaste}>
          <p className="text-[13px] text-muted">
            Cuenta qué estabas haciendo y qué pasó. Le llega al administrador
            junto con la pantalla donde estás (
            <span className="font-medium text-fg">
              {nombrePagina(pathname)}
            </span>
            ).
          </p>
          <Textarea
            className="mt-4 min-h-[120px]"
            value={mensaje}
            maxLength={1000}
            autoFocus
            placeholder="Ej.: al darle Ver al registro sale en blanco."
            onChange={(e) => setMensaje(e.target.value)}
            aria-label="Qué pasó"
          />

          <p className="mt-4 text-[13px] font-bold">
            Fotos o capturas{" "}
            <span className="font-normal text-muted">
              (opcional, hasta {MAX_FOTOS} · también puedes pegarlas con Ctrl+V)
            </span>
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            {fotos.map((f, i) => (
              <div
                key={i}
                className="relative h-20 w-28 overflow-hidden rounded-ctl border border-border bg-subtle"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={f}
                  alt={`Foto ${i + 1}`}
                  className="h-full w-full object-cover"
                />
                <button
                  type="button"
                  onClick={() => setFotos((x) => x.filter((_, j) => j !== i))}
                  aria-label={`Quitar foto ${i + 1}`}
                  className="absolute right-1 top-1 grid h-6 w-6 place-items-center rounded-full bg-black/70 text-white hover:bg-black"
                >
                  <IconX width={12} height={12} />
                </button>
              </div>
            ))}
            {fotos.length < MAX_FOTOS && (
              <label
                className={cx(
                  "grid h-20 w-28 cursor-pointer place-items-center rounded-ctl border border-dashed border-border text-[12px] text-muted transition-colors duration-100 hover:border-fg/30 hover:text-fg",
                  preparando && "pointer-events-none opacity-60",
                )}
              >
                <span className="flex flex-col items-center gap-1">
                  <IconPlus width={16} height={16} />
                  {preparando ? "Preparando…" : "Agregar foto"}
                </span>
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  className="sr-only"
                  onChange={(e) => {
                    const input = e.currentTarget;
                    void agregar([...(input.files ?? [])]).finally(
                      () => (input.value = ""),
                    );
                  }}
                />
              </label>
            )}
          </div>
          <p className="mt-3 text-[12px] text-faint">
            No escribas cédulas ni teléfonos (si los pones, se ocultan) y revisa
            que las fotos no los muestren.
          </p>
        </div>
      </Modal>
    </>
  );
}
