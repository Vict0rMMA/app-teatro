"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PizZip from "pizzip";
import { useCallback, useEffect, useState } from "react";
import { DocxPreview } from "@/components/docx-preview";
import { filenameFrom, saveBlob } from "@/components/hooks";
import { IconAlert, IconCheck, IconCopy, IconDownload, IconEye, IconFile, IconTrash, IconWhatsapp } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Modal, Skeleton, Stat, cx } from "@/components/ui";
import { getStaff, watchEvent, type EventDoc, type StaffDoc } from "@/lib/data";
import { apiFetch, apiJson } from "@/lib/firebase/client";
import { fechaWhatsapp, formatCOP, formatHoras, hora12 } from "@/lib/format";
import { leerRegistro } from "@/lib/registro-memoria";

type Key = "registro" | "llaves" | "colillas" | "evaluacion";
const FILES: Array<{ key: Key; label: string }> = [
  { key: "registro", label: "Registro" },
  { key: "llaves", label: "Llaves" },
  { key: "colillas", label: "Colillas" },
  { key: "evaluacion", label: "Evaluación" },
];

async function fetchFile(eventId: string, file: string) {
  const res = await apiFetch(`/api/planillas/${eventId}/${file}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.error ?? "No se pudo descargar.");
  }
  return { blob: await res.blob(), name: filenameFrom(res, `${file}.docx`) };
}

export default function PlanillaPage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const toast = useToast();
  const [event, setEvent] = useState<EventDoc | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffDoc[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [preview, setPreview] = useState<Key | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  // REGISTRO completo (con cédulas y teléfonos): solo existe en memoria justo después de generar.
  const [completo] = useState(() => leerRegistro(id));

  useEffect(() => watchEvent(id, setEvent, () => setEvent(null)), [id]);
  useEffect(() => {
    getStaff(id).then(setStaff).catch(() => setStaff([]));
  }, [id]);

  const getFile = useCallback(
    async (key: Key) => {
      if (key === "registro" && completo) return { blob: completo.blob, name: completo.name };
      return fetchFile(id, key);
    },
    [id, completo],
  );

  async function download(key: Key | "zip") {
    setBusy(key);
    try {
      if (key === "zip") {
        const { blob, name } = await fetchFile(id, "zip");
        if (!completo) return saveBlob(blob, name);
        // Reemplaza el registro regenerado por el completo que está en memoria.
        const zip = new PizZip(await blob.arrayBuffer());
        Object.keys(zip.files).filter((n) => n.startsWith("REGISTRO_")).forEach((n) => zip.remove(n));
        zip.file(completo.name, await completo.blob.arrayBuffer());
        return saveBlob(zip.generate({ type: "blob", compression: "DEFLATE" }) as Blob, name);
      }
      const { blob, name } = await getFile(key);
      saveBlob(blob, name);
    } catch (e) {
      toast.error("Error al descargar", (e as Error).message);
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    if (!event) return;
    try {
      await navigator.clipboard.writeText(event.whatsapp);
    } catch {
      const t = document.createElement("textarea");
      t.value = event.whatsapp;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
    setCopied(true);
    toast.success("Mensaje copiado", "Pégalo en el grupo de WhatsApp.");
    setTimeout(() => setCopied(false), 2000);
  }

  async function remove() {
    setBusy("delete");
    try {
      await apiJson(`/api/planillas/${id}`, { method: "DELETE" });
      toast.success("Planilla eliminada");
      router.replace("/planillas");
    } catch (e) {
      toast.error("No se pudo eliminar", (e as Error).message);
      setBusy(null);
    }
  }

  const loadPreview = useCallback(async () => (await getFile(preview ?? "llaves")).blob, [getFile, preview]);

  if (event === undefined) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-7 w-72" />
        <Skeleton className="h-4 w-48" />
        <Skeleton className="mt-6 h-40 w-full" />
      </div>
    );
  }
  if (event === null) {
    return (
      <Card>
        <EmptyState
          icon={<IconFile />}
          title="Planilla no encontrada"
          description="Puede que la hayas eliminado o que el enlace no sea tuyo."
          action={
            <Link href="/planillas">
              <Button>Ir al historial</Button>
            </Link>
          }
        />
      </Card>
    );
  }

  const sinFirma = completo?.sinFirma ?? event.sinFirma;

  return (
    <div className="animate-fade-up">
      <div className="mb-6 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <Link href="/planillas" className="text-[13px] text-muted hover:text-fg">
            ← Historial
          </Link>
          <h1 className="mt-2 text-xl font-bold">PLANILLAS {event.nombre.toUpperCase()}</h1>
          <p className="mt-1 text-sm text-muted">
            {fechaWhatsapp(event.fecha)} de {event.fecha.slice(0, 4)} · Citación {hora12(event.horaCitacion)} · Evento {hora12(event.horaEvento)}
          </p>
        </div>
        <Button variant="primary" icon={<IconDownload />} loading={busy === "zip"} onClick={() => download("zip")}>
          Descargar todo (.zip)
        </Button>
      </div>

      {(sinFirma || (completo?.alertas.length ?? 0) > 0) && (
        <div className="mb-5 space-y-1 rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-[13px]">
          {sinFirma && (
            <p className="flex gap-2">
              <IconAlert className="mt-0.5 shrink-0 text-warn" width={14} height={14} />
              <span>
                Las planillas salieron sin firma.{" "}
                <Link href="/ajustes" className="font-medium underline underline-offset-2">
                  Agrega tu firma en Ajustes
                </Link>{" "}
                y vuelve a descargarlas: se regeneran con ella.
              </span>
            </p>
          )}
          {completo?.alertas.map((a) => (
            <p key={a} className="flex gap-2">
              <IconAlert className="mt-0.5 shrink-0 text-warn" width={14} height={14} />
              {a}
            </p>
          ))}
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[1fr_380px]">
        <div className="space-y-5">
          <Card>
            <CardHeader title="Archivos" description="Generados desde las plantillas originales del Teatro." />
            <ul className="divide-y divide-border">
              {FILES.map((f) => (
                <li key={f.key} className="flex items-center gap-3 px-4 py-3 sm:px-5">
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-border bg-subtle text-muted">
                    <IconFile />
                  </span>
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-medium">{f.label}</p>
                    {f.key === "registro" && (
                      <p className="text-[11px] text-faint">
                        {completo ? "Completo, con cédulas y teléfonos. No se guarda: descárgalo ahora." : "Regenerado sin cédulas ni teléfonos (no se guardan)."}
                      </p>
                    )}
                  </div>
                  <Button size="sm" variant="ghost" icon={<IconEye />} onClick={() => setPreview(f.key)}>
                    <span className="hidden sm:inline">Previsualizar</span>
                  </Button>
                  <Button size="sm" icon={<IconDownload />} loading={busy === f.key} onClick={() => download(f.key)}>
                    <span className="hidden sm:inline">Descargar</span>
                  </Button>
                </li>
              ))}
            </ul>
          </Card>

          <Card>
            <CardHeader title="Personal del evento" description={staff ? `${staff.length} personas` : "Cargando…"} />
            {staff === null ? (
              <div className="space-y-2 p-5">
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-5/6" />
              </div>
            ) : staff.length === 0 ? (
              <p className="px-5 py-6 text-center text-[13px] text-muted">Esta planilla se generó sin lista de personal.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[620px] text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                      <th className="py-2 pl-5 font-medium">Nombre</th>
                      <th className="py-2 font-medium">Cargo</th>
                      <th className="py-2 font-medium">Horario</th>
                      <th className="py-2 text-right font-medium">Horas</th>
                      <th className="py-2 text-right font-medium">Valor</th>
                      <th className="py-2 pr-5 text-right font-medium">P.P / Desemp.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => (
                      <tr key={s.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2 pl-5">{s.nombre}</td>
                        <td className="py-2">{s.cargo ? <Badge tone={s.cargo === "C" ? "brand" : "neutral"}>{s.cargo}</Badge> : "—"}</td>
                        <td className="tabular py-2 text-muted">{s.llegada ? `${hora12(s.llegada, true)} – ${hora12(s.salida, true)}` : "—"}</td>
                        <td className="tabular py-2 text-right">{formatHoras(s.horas)}</td>
                        <td className="tabular py-2 text-right">{formatCOP(s.valor)}</td>
                        <td className="tabular py-2 pr-5 text-right text-muted">
                          {s.pp || "—"} / {s.desempeno || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-medium">
                      <td className="py-2.5 pl-5" colSpan={3}>
                        Total
                      </td>
                      <td className="tabular py-2.5 text-right">{formatHoras(event.totalHoras)}</td>
                      <td className="tabular py-2.5 text-right">{formatCOP(event.totalPagado)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card>
            <CardHeader
              title="Mensaje de WhatsApp"
              action={
                <Button size="sm" icon={copied ? <IconCheck /> : <IconCopy />} onClick={copy}>
                  {copied ? "Copiado" : "Copiar"}
                </Button>
              }
            />
            <div className="p-4 sm:p-5">
              <div className="rounded-lg rounded-tl-none bg-[#e7ffdb] px-3.5 py-2.5 text-[13.5px] leading-relaxed text-[#111b21] shadow-card dark:bg-[#144d37] dark:text-[#e9edef]">
                <WhatsappText text={event.whatsapp} />
              </div>
              <a
                href={`https://wa.me/?text=${encodeURIComponent(event.whatsapp)}`}
                target="_blank"
                rel="noreferrer"
                className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
              >
                <IconWhatsapp width={14} height={14} /> Abrir en WhatsApp
              </a>
            </div>
          </Card>

          <div className="grid grid-cols-2 gap-3">
            <Stat label="Aforo" value={event.aforo != null ? event.aforo.toLocaleString("es-CO") : "____"} sub="personas" />
            <Stat label="Pagado al personal" value={formatCOP(event.totalPagado)} sub={`${formatHoras(event.totalHoras)} horas`} />
          </div>

          {event.evaluacion?.notas?.length > 0 && (
            <Card className="px-4 py-3 sm:px-5">
              <p className="text-xs text-muted">Notas</p>
              <ul className="mt-1 list-disc space-y-0.5 pl-4 text-[13px]">
                {event.evaluacion.notas.map((n) => (
                  <li key={n}>{n}</li>
                ))}
              </ul>
            </Card>
          )}

          <Button variant="ghost" icon={<IconTrash />} className="w-full text-danger hover:text-danger" onClick={() => setConfirmDelete(true)}>
            Eliminar planilla
          </Button>
        </div>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `Previsualizar · ${FILES.find((f) => f.key === preview)?.label}` : ""} wide>
        <div className="mb-3 flex flex-wrap gap-1">
          {FILES.map((f) => (
            <button
              key={f.key}
              onClick={() => setPreview(f.key)}
              className={cx("rounded-md px-2.5 py-1 text-[13px]", preview === f.key ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg")}
            >
              {f.label}
            </button>
          ))}
        </div>
        {preview && <DocxPreview key={preview} load={loadPreview} />}
      </Modal>

      <Modal
        open={confirmDelete}
        onClose={() => setConfirmDelete(false)}
        title="Eliminar planilla"
        footer={
          <>
            <Button onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="danger" loading={busy === "delete"} onClick={remove}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          Se borran los datos y la lista de personal de <span className="font-medium text-fg">{event.nombre}</span>. Las horas que guardaste en Mis horas se conservan.
        </p>
      </Modal>
    </div>
  );
}

/** Muestra *negrilla* como lo hace WhatsApp. */
function WhatsappText({ text }: { text: string }) {
  return (
    <div className="whitespace-pre-wrap break-words">
      {text.split(/(\*[^*\n]+\*)/g).map((part, i) =>
        part.startsWith("*") && part.endsWith("*") && part.length > 2 ? <strong key={i}>{part.slice(1, -1)}</strong> : <span key={i}>{part}</span>,
      )}
    </div>
  );
}
