"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PizZip from "pizzip";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { DocxPreview } from "@/components/docx-preview";
import { filenameFrom, saveBlob } from "@/components/hooks";
import { IconAlert, IconCheck, IconCopy, IconDownload, IconEye, IconFile, IconTrash, IconWhatsapp } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Badge, Button, EmptyState, Card, Modal, Skeleton, Spinner, cx } from "@/components/ui";
import { getStaff, watchEvent, type EventDoc, type StaffDoc } from "@/lib/data";
import { apiFetch, apiJson } from "@/lib/firebase/client";
import { fechaWhatsapp, formatCOP, formatHoras, hora12 } from "@/lib/format";
import { leerRegistro } from "@/lib/registro-memoria";

type Key = "registro" | "llaves" | "colillas" | "evaluacion";
const FILES: Array<{ key: Key; label: string; desc: string }> = [
  { key: "registro", label: "Registro", desc: "Personal, horas y pagos" },
  { key: "llaves", label: "Llaves", desc: "Relación de acomodadores" },
  { key: "colillas", label: "Colillas", desc: "Control de boletas" },
  { key: "evaluacion", label: "Evaluación", desc: "Evaluación del evento" },
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
  const { user } = useSession();
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
    getStaff(id, user.uid)
      .then(setStaff)
      .catch(() => setStaff([]));
  }, [id, user.uid]);

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
        Object.keys(zip.files)
          .filter((n) => n.startsWith("REGISTRO_"))
          .forEach((n) => zip.remove(n));
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
        <Skeleton className="h-4 w-24" />
        <Skeleton className="h-9 w-96" />
        <Skeleton className="mt-6 h-24 w-full" />
        <Skeleton className="h-48 w-full" />
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
  const coordinadores = staff?.filter((s) => s.cargo === "C" || s.cargo === "AC").length ?? 0;

  return (
    <div className="animate-fade-up">
      {/* Encabezado */}
      <Link href="/planillas" className="text-[13px] text-muted hover:text-fg">
        ← Historial
      </Link>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="text-xs font-bold uppercase tracking-wider text-brand">Planillas</p>
          <h1 className="mt-1 text-3xl font-bold leading-tight">{event.nombre}</h1>
          <div className="mt-3 flex flex-wrap gap-x-5 gap-y-1 text-sm text-muted">
            <span>
              {fechaWhatsapp(event.fecha)} de {event.fecha.slice(0, 4)}
            </span>
            <span>Citación {hora12(event.horaCitacion)}</span>
            <span>Evento {hora12(event.horaEvento)}</span>
            {event.salida && <span>Salida {hora12(event.salida)}</span>}
          </div>
        </div>
        <Button variant="primary" icon={<IconDownload />} loading={busy === "zip"} onClick={() => download("zip")} className="shrink-0">
          Descargar las 4 (.zip)
        </Button>
      </div>

      {(sinFirma || (completo?.alertas.length ?? 0) > 0) && (
        <div className="mt-6 space-y-1 border-l-2 border-warn bg-warn/5 px-4 py-3 text-[13px]">
          {sinFirma && (
            <p className="flex gap-2">
              <IconAlert className="mt-0.5 shrink-0 text-warn" width={14} height={14} />
              <span>
                Las planillas salieron sin firma.{" "}
                <Link href="/ajustes" className="font-bold underline underline-offset-2">
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

      {/* Cifras */}
      <div className="mt-6 grid grid-cols-2 overflow-hidden rounded-lg border border-border bg-surface lg:grid-cols-4">
        {[
          { label: "Aforo", value: event.aforo != null ? event.aforo.toLocaleString("es-CO") : "—", sub: event.aforo != null ? "personas" : "sin dato" },
          { label: "Personal", value: String(event.staffCount), sub: staff ? `${coordinadores} coordinación · ${event.staffCount - coordinadores} acomodadores` : "…" },
          { label: "Horas", value: formatHoras(event.totalHoras), sub: "del personal" },
          { label: "Pagado", value: formatCOP(event.totalPagado), sub: "al personal" },
        ].map((k, i) => (
          <div key={k.label} className={cx("px-5 py-4", i % 2 === 1 && "border-l border-border", i >= 2 && "border-t border-border lg:border-t-0", i === 2 && "lg:border-l")}>
            <p className="text-xs text-muted">{k.label}</p>
            <p className="tabular mt-1 text-2xl font-bold">{k.value}</p>
            <p className="mt-1 truncate text-xs text-faint">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          {/* Archivos */}
          <section>
            <h2 className="mb-3 text-sm font-bold">Archivos</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {FILES.map((f) => (
                <div key={f.key} className="group flex gap-3 rounded-lg border border-border bg-surface p-3 transition-colors hover:border-fg/20">
                  <button
                    onClick={() => setPreview(f.key)}
                    className="relative grid h-[68px] w-[54px] shrink-0 place-items-center rounded border border-border bg-white"
                    aria-label={`Previsualizar ${f.label}`}
                  >
                    <span className="absolute right-0 top-0 h-3 w-3 rounded-bl border-b border-l border-border bg-subtle" />
                    <span className="space-y-1">
                      <span className="block h-[3px] w-7 rounded bg-brand" />
                      <span className="block h-[3px] w-7 rounded bg-zinc-300" />
                      <span className="block h-[3px] w-5 rounded bg-zinc-300" />
                      <span className="block h-[3px] w-6 rounded bg-zinc-300" />
                    </span>
                  </button>
                  <div className="flex min-w-0 flex-1 flex-col">
                    <p className="text-sm font-bold">{f.label}</p>
                    <p className="text-xs text-muted">{f.desc}</p>
                    {f.key === "registro" && (
                      <p className={cx("mt-0.5 text-[11px]", completo ? "text-ok" : "text-faint")}>
                        {completo ? "Completo con cédulas: descárgalo ahora" : "Sin cédulas ni teléfonos"}
                      </p>
                    )}
                    <div className="mt-auto flex gap-1 pt-2">
                      <button
                        onClick={() => download(f.key)}
                        disabled={busy === f.key}
                        className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs font-bold text-fg hover:bg-subtle disabled:opacity-60"
                      >
                        {busy === f.key ? <Spinner className="h-3 w-3" /> : <IconDownload width={13} height={13} />} Descargar
                      </button>
                      <button onClick={() => setPreview(f.key)} className="inline-flex h-7 items-center gap-1.5 rounded px-2 text-xs text-muted hover:bg-subtle hover:text-fg">
                        <IconEye width={13} height={13} /> Ver
                      </button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Personal */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="text-sm font-bold">Personal del evento</h2>
              {staff && staff.length > 0 && <span className="text-xs text-faint">{staff.length} personas</span>}
            </div>
            {staff === null ? (
              <Skeleton className="h-40 w-full" />
            ) : staff.length === 0 ? (
              <p className="rounded-lg border border-dashed border-border px-5 py-8 text-center text-[13px] text-muted">Esta planilla se generó sin lista de personal.</p>
            ) : (
              <div className="overflow-x-auto rounded-lg border border-border bg-surface">
                <table className="w-full min-w-[600px] text-[13px]">
                  <thead>
                    <tr className="border-b border-border bg-subtle/50 text-left text-[11px] font-bold uppercase tracking-wide text-faint">
                      <th className="py-2.5 pl-4">Nombre</th>
                      <th className="py-2.5">Cargo</th>
                      <th className="py-2.5">Horario</th>
                      <th className="py-2.5 text-right">Horas</th>
                      <th className="py-2.5 text-right">Valor</th>
                      <th className="py-2.5 pr-4 text-right">P.P · Des.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => (
                      <tr key={s.id} className="border-b border-border/60 last:border-0">
                        <td className="py-2.5 pl-4 font-bold">{s.nombre}</td>
                        <td className="py-2.5">{s.cargo ? <Badge tone={s.cargo === "C" ? "brand" : "neutral"}>{s.cargo}</Badge> : "—"}</td>
                        <td className="tabular py-2.5 text-muted">{s.llegada ? `${hora12(s.llegada, true)} – ${hora12(s.salida, true)}` : "—"}</td>
                        <td className="tabular py-2.5 text-right">{formatHoras(s.horas)}</td>
                        <td className="tabular py-2.5 text-right">{formatCOP(s.valor)}</td>
                        <td className="tabular py-2.5 pr-4 text-right text-muted">
                          {s.pp || "—"} · {s.desempeno || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-bold">
                      <td className="py-3 pl-4" colSpan={3}>
                        Total
                      </td>
                      <td className="tabular py-3 text-right">{formatHoras(event.totalHoras)}</td>
                      <td className="tabular py-3 text-right">{formatCOP(event.totalPagado)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            )}
          </section>
        </div>

        <aside className="min-w-0 space-y-8">
          {/* WhatsApp */}
          <section>
            <div className="mb-3 flex items-center justify-between">
              <h2 className="text-sm font-bold">Mensaje para el grupo</h2>
              <button onClick={copy} className="inline-flex items-center gap-1.5 text-xs font-bold text-brand hover:underline">
                {copied ? <IconCheck width={13} height={13} /> : <IconCopy width={13} height={13} />}
                {copied ? "Copiado" : "Copiar"}
              </button>
            </div>
            <div className="rounded-lg border border-border bg-[#efeae2] p-4 dark:bg-[#0b141a]">
              <div className="relative ml-auto max-w-[95%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 pb-5 pt-2 text-[13.5px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
                <WhatsappText text={event.whatsapp} />
                <span className="absolute bottom-1 right-2 inline-flex items-center gap-0.5 text-[10px] text-[#667781] dark:text-[#ffffff99]">
                  ahora <IconCheck width={12} height={12} className="text-[#53bdeb]" />
                </span>
              </div>
            </div>
            <a
              href={`https://wa.me/?text=${encodeURIComponent(event.whatsapp)}`}
              target="_blank"
              rel="noreferrer"
              className="mt-3 inline-flex items-center gap-1.5 text-[13px] text-muted hover:text-fg"
            >
              <IconWhatsapp width={14} height={14} /> Abrir en WhatsApp
            </a>
          </section>

          {event.evaluacion?.notas?.length > 0 && (
            <section>
              <h2 className="mb-2 text-sm font-bold">Notas</h2>
              <ul className="space-y-1.5 text-[13px]">
                {event.evaluacion.notas.map((n) => (
                  <li key={n} className="flex gap-2">
                    <span className="mt-[7px] h-1 w-1 shrink-0 rounded-full bg-brand" />
                    {n}
                  </li>
                ))}
              </ul>
            </section>
          )}

          <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-[13px] text-faint hover:text-danger">
            <IconTrash width={14} height={14} /> Eliminar planilla
          </button>
        </aside>
      </div>

      <Modal open={!!preview} onClose={() => setPreview(null)} title={preview ? `Previsualizar · ${FILES.find((f) => f.key === preview)?.label}` : ""} wide>
        <div className="mb-3 flex flex-wrap gap-1">
          {FILES.map((f) => (
            <button
              key={f.key}
              onClick={() => setPreview(f.key)}
              className={cx("rounded-md px-2.5 py-1 text-[13px]", preview === f.key ? "bg-subtle font-bold text-fg" : "text-muted hover:text-fg")}
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
          Se borran los datos y la lista de personal de <span className="font-bold text-fg">{event.nombre}</span>. Las horas que guardaste en Mis horas se conservan.
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
