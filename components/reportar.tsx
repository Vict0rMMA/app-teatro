"use client";

import { usePathname } from "next/navigation";
import { useState } from "react";
import { apiJson } from "@/lib/firebase/client";
import { IconAlert } from "./icons";
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

function nombrePagina(path: string) {
  if (path.startsWith("/planillas/")) return "Detalle de planilla";
  return PAGINAS[path] ?? path;
}

/** Botón "Reportar un problema": el mensaje le llega a la administradora (Administración). */
export function ReportarProblema({ compacto, className }: { compacto?: boolean; className?: string }) {
  const pathname = usePathname();
  const toast = useToast();
  const [abierto, setAbierto] = useState(false);
  const [mensaje, setMensaje] = useState("");
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    if (mensaje.trim().length < 5) return toast.error("Cuéntanos un poco más", "Escribe qué pasó para poder arreglarlo.");
    setEnviando(true);
    try {
      await apiJson("/api/reportes", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mensaje, pagina: nombrePagina(pathname) }) });
      toast.success("Reporte enviado", "Gracias. Le llegó al administrador.");
      setMensaje("");
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
            ? "grid h-8 w-8 place-items-center rounded-ctl text-muted hover:bg-subtle hover:text-fg"
            : "flex h-8 items-center gap-2 rounded-ctl px-2 text-[13px] text-muted transition-colors duration-100 hover:bg-subtle hover:text-fg",
          className,
        )}
      >
        <IconAlert width={15} height={15} />
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
            <Button variant="primary" loading={enviando} onClick={enviar}>
              Enviar
            </Button>
          </>
        }
      >
        <p className="text-[13px] text-muted">
          Cuenta qué estabas haciendo y qué pasó. Le llega al administrador junto con la pantalla donde estás (
          <span className="font-medium text-fg">{nombrePagina(pathname)}</span>).
        </p>
        <Textarea
          className="mt-4 min-h-[140px]"
          value={mensaje}
          maxLength={1000}
          autoFocus
          placeholder="Ej.: al darle Ver al registro sale en blanco."
          onChange={(e) => setMensaje(e.target.value)}
          aria-label="Qué pasó"
        />
        <p className="mt-2 text-[12px] text-faint">No escribas cédulas ni teléfonos: si los pones, se ocultan.</p>
      </Modal>
    </>
  );
}
