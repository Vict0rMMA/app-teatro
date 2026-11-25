"use client";

import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import PizZip from "pizzip";
import { useCallback, useEffect, useState } from "react";
import { useSession } from "@/components/auth-provider";
import { DocxPreview } from "@/components/docx-preview";
import { filenameFrom, saveBlob } from "@/components/hooks";
import { IconAlert, IconCheck, IconCopy, IconDownload, IconEye, IconFile, IconPencil, IconTrash, IconWhatsapp } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Badge, Button, EmptyState, Card, Modal, Skeleton, Spinner, Textarea, cx } from "@/components/ui";
import { getStaff, watchEvent, type EventDoc, type StaffDoc } from "@/lib/data";
import { withDefaults } from "@/lib/schemas";
import { apiFetch, apiJson } from "@/lib/firebase/client";
import { fechaWhatsapp, formatCOP, hora12, formatDuracion } from "@/lib/format";
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
  const { user, profile } = useSession();
  const { ubicaciones, grupoWhatsapp: grupo } = withDefaults(profile.defaults);
  const router = useRouter();
  const toast = useToast();
  const [event, setEvent] = useState<EventDoc | null | undefined>(undefined);
  const [staff, setStaff] = useState<StaffDoc[] | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  // Mensaje de WhatsApp editable. Los cambios se guardan en este equipo, por planilla.
  const claveMensaje = `wa-mensaje:${id}`;
  const [mensajeEditado, setMensajeEditado] = useState<string | null>(() => {
    try {
      return localStorage.getItem(`wa-mensaje:${id}`);
    } catch {
      return null;
    }
  });
  const [editando, setEditando] = useState(false);
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

  const mensaje = mensajeEditado ?? event?.whatsapp ?? "";
  const editado = mensajeEditado != null && mensajeEditado !== event?.whatsapp;
  function cambiarMensaje(texto: string) {
    const original = texto === event?.whatsapp;
    setMensajeEditado(original ? null : texto);
    try {
      if (original) localStorage.removeItem(claveMensaje);
      else localStorage.setItem(claveMensaje, texto);
    } catch {
      /* sin almacenamiento: se queda solo en esta pantalla */
    }
  }

  async function copiarTexto(texto: string) {
    try {
      await navigator.clipboard.writeText(texto);
    } catch {
      const t = document.createElement("textarea");
      t.value = texto;
      document.body.appendChild(t);
      t.select();
      document.execCommand("copy");
      t.remove();
    }
  }

  async function copiarYAbrirGrupo() {
    // Se abre primero (en el mismo gesto del clic) para que el navegador no lo bloquee.
    window.open(enlaceGrupo(grupo), "_blank", "noopener");
    await copiarTexto(mensaje);
    setEditando(false);
    toast.success("Mensaje copiado", "En el grupo, pega con Ctrl+V o mantén presionado → Pegar.");
  }

  async function copy() {
    if (!event) return;
    await copiarTexto(mensaje);
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
      <div className="border-y border-border">
        <EmptyState
          title="Planilla no encontrada"
          description="Puede que la hayas eliminado o que el enlace no sea tuyo."
          action={
            <Link href="/planillas">
              <Button>Ir al historial</Button>
            </Link>
          }
        />
      </div>
    );
  }

  const sinFirma = completo?.sinFirma ?? event.sinFirma;
  const coordinadores = staff?.filter((s) => s.cargo === "C" || s.cargo === "AC").length ?? 0;

  return (
    <div>
      {/* Encabezado */}
      <Link href="/planillas" className="text-[13px] text-muted hover:text-fg">
        ← Historial
      </Link>
      <div className="mt-3 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <p className="eyebrow">Planilla</p>
          <h1 className="mt-2 font-bold tracking-tight text-[28px] leading-[1.1] sm:text-[34px]">{event.nombre}</h1>
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

      {/* Cifras */}
      <div className="mt-8 grid grid-cols-2 border-y border-border lg:grid-cols-4">
        {[
          { label: "Aforo", value: event.aforo != null ? event.aforo.toLocaleString("es-CO") : "—", sub: event.aforo != null ? "personas" : "sin dato" },
          { label: "Personal", value: String(event.staffCount), sub: staff ? `${coordinadores} coordinación · ${event.staffCount - coordinadores} acomodadores` : "…" },
          { label: "Horas", value: formatDuracion(event.totalHoras), sub: "del personal" },
          { label: "Pagado", value: formatCOP(event.totalPagado), sub: "al personal" },
        ].map((k, i) => (
          <div key={k.label} className={cx("min-w-0 py-5", i % 2 === 1 ? "border-l border-border pl-5" : "pr-5", i >= 2 && "border-t border-border lg:border-t-0", i === 2 && "lg:border-l lg:pl-5")}>
            <p className="eyebrow">{k.label}</p>
            <p className="tabular mt-1 font-bold tracking-tight text-[26px] leading-tight">{k.value}</p>
            <p className="mt-1 truncate text-xs text-muted">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="mt-8 grid gap-8 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-8">
          {/* Archivos */}
          <section>
            <h2 className="mb-4 text-xl font-bold tracking-tight">Archivos</h2>

            {/* Registro: el documento base, destacado */}
            <div className="flex flex-col gap-5 rounded-box border border-brand/35 bg-surface p-5 sm:flex-row sm:items-center">
              <Miniatura grande onClick={() => setPreview("registro")} label="Previsualizar Registro" />
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
                  <p className="text-lg font-bold tracking-tight">Registro</p>
                  {completo ? <Badge tone="ok">Completo con cédulas · descárgalo ahora</Badge> : <Badge>Sin cédulas ni teléfonos</Badge>}
                </div>
                <p className="mt-1 text-[13px] text-muted">Documento base con el personal, las horas y los pagos. Las otras tres planillas salen de aquí.</p>
                <div className="mt-4 flex flex-wrap gap-2">
                  <Button variant="primary" loading={busy === "registro"} icon={<IconDownload width={15} height={15} />} onClick={() => download("registro")}>
                    Descargar registro
                  </Button>
                  <Button icon={<IconEye width={15} height={15} />} onClick={() => setPreview("registro")}>
                    Ver
                  </Button>
                </div>
              </div>
            </div>

            {/* Las otras tres, iguales */}
            <div className="mt-3 grid gap-3 sm:grid-cols-3">
              {FILES.filter((f) => f.key !== "registro").map((f) => (
                <div key={f.key} className="flex flex-col overflow-hidden rounded-box border border-border bg-surface transition-colors duration-100 hover:border-fg/25">
                  <div className="flex flex-1 items-start gap-3 p-4">
                    <Miniatura onClick={() => setPreview(f.key)} label={`Previsualizar ${f.label}`} />
                    <div className="min-w-0">
                      <p className="text-sm font-bold">{f.label}</p>
                      <p className="mt-0.5 text-xs text-muted">{f.desc}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 border-t border-border text-[13px]">
                    <button
                      onClick={() => download(f.key)}
                      disabled={busy === f.key}
                      aria-busy={busy === f.key || undefined}
                      className="flex h-10 items-center justify-center gap-1.5 font-medium text-fg transition-colors duration-100 hover:bg-subtle disabled:cursor-wait"
                    >
                      {busy === f.key ? <Spinner className="h-3.5 w-3.5" /> : <IconDownload width={14} height={14} />} Descargar
                    </button>
                    <button
                      onClick={() => setPreview(f.key)}
                      className="flex h-10 items-center justify-center gap-1.5 border-l border-border text-muted transition-colors duration-100 hover:bg-subtle hover:text-fg"
                    >
                      <IconEye width={14} height={14} /> Ver
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </section>

          {/* Personal */}
          <section>
            <div className="mb-3 flex items-baseline justify-between">
              <h2 className="font-bold tracking-tight text-xl">Personal del evento</h2>
              {staff && staff.length > 0 && <span className="text-xs text-muted">{staff.length} personas</span>}
            </div>
            {staff === null ? (
              <Skeleton className="h-40 w-full" />
            ) : staff.length === 0 ? (
              <p className="border-y border-border px-5 py-8 text-center text-[13px] text-muted">Esta planilla se generó sin lista de personal.</p>
            ) : (
              <div className="overflow-x-auto rounded-box border border-border bg-surface">
                <table className="w-full min-w-[660px] text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] font-medium uppercase tracking-[0.06em] text-muted">
                      <th className="py-2.5 pl-4">Nombre</th>
                      <th className="py-2.5">Cargo</th>
                      <th className="py-2.5">UBI</th>
                      <th className="py-2.5">Horario</th>
                      <th className="py-2.5 text-right">Horas</th>
                      <th className="py-2.5 text-right">Valor</th>
                      <th className="py-2.5 pr-4 text-right">P.P · Des.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staff.map((s) => (
                      <tr key={s.id} className="border-b border-border/60 transition-colors duration-100 last:border-0 hover:bg-subtle/40">
                        <td className="py-2.5 pl-4 font-medium">{s.nombre}</td>
                        <td className="py-2.5">{s.cargo ? <Badge tone={s.cargo === "C" ? "brand" : "neutral"}>{s.cargo}</Badge> : "—"}</td>
                        <td className="py-2.5">
                          {s.ubi ? (
                            <span
                              title={ubicaciones[s.ubi.toUpperCase()] ?? undefined}
                              className={ubicaciones[s.ubi.toUpperCase()] ? "cursor-help underline decoration-dotted underline-offset-2" : "text-muted"}
                            >
                              {s.ubi}
                            </span>
                          ) : (
                            <span className="text-faint">—</span>
                          )}
                        </td>
                        <td className="tabular py-2.5 text-muted">{s.llegada ? `${hora12(s.llegada, true)} – ${hora12(s.salida, true)}` : "—"}</td>
                        <td className="tabular whitespace-nowrap py-2.5 text-right">{formatDuracion(s.horas)}</td>
                        <td className="tabular py-2.5 text-right">{formatCOP(s.valor)}</td>
                        <td className="tabular py-2.5 pr-4 text-right text-muted">
                          {s.pp || "—"} · {s.desempeno || "—"}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr className="border-t border-border font-bold tracking-tight text-[16px]">
                      <td className="py-3 pl-4" colSpan={4}>
                        Total
                      </td>
                      <td className="tabular whitespace-nowrap py-3 text-right">{formatDuracion(event.totalHoras)}</td>
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
              <h2 className="eyebrow text-fg">Mensaje para el grupo</h2>
              {!editando ? (
                <button onClick={() => setEditando(true)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand underline-offset-2 hover:underline">
                  <IconPencil width={13} height={13} /> Editar
                </button>
              ) : (
                <button onClick={() => setEditando(false)} className="inline-flex items-center gap-1.5 text-xs font-medium text-brand underline-offset-2 hover:underline">
                  <IconCheck width={13} height={13} /> Listo
                </button>
              )}
            </div>

            {editando ? (
              <div>
                <Textarea
                  autoFocus
                  rows={10}
                  value={mensaje}
                  onChange={(e) => cambiarMensaje(e.target.value)}
                  className="text-[13.5px] leading-relaxed"
                  aria-label="Mensaje para el grupo"
                />
                <div className="mt-1.5 flex items-center justify-between text-xs text-muted">
                  <span>*texto* sale en negrita en WhatsApp.</span>
                  {editado && (
                    <button onClick={() => cambiarMensaje(event.whatsapp)} className="underline underline-offset-2 hover:text-fg">
                      Volver al original
                    </button>
                  )}
                </div>
              </div>
            ) : (
              <button
                onClick={() => setEditando(true)}
                className="block w-full rounded-box border border-border bg-[#efeae2] p-4 text-left transition-colors duration-100 hover:border-fg/25 dark:bg-[#0b141a]"
                aria-label="Editar el mensaje"
              >
                <div className="relative ml-auto max-w-[95%] rounded-lg rounded-tr-none bg-[#d9fdd3] px-3 pb-5 pt-2 text-[13.5px] leading-relaxed text-[#111b21] shadow-sm dark:bg-[#005c4b] dark:text-[#e9edef]">
                  <WhatsappText text={mensaje} />
                  <span className="absolute bottom-1 right-2 inline-flex items-center gap-0.5 text-[10px] text-[#667781] dark:text-[#ffffff99]">
                    {editado ? "editado" : "ahora"} <IconCheck width={12} height={12} className="text-[#53bdeb]" />
                  </span>
                </div>
              </button>
            )}

            <div className="mt-3 grid gap-2">
              {grupo && (
                <Button variant="primary" icon={<IconWhatsapp width={15} height={15} />} onClick={copiarYAbrirGrupo}>
                  Copiar y abrir el grupo
                </Button>
              )}
              <div className="grid grid-cols-2 gap-2">
                <Button icon={copied ? <IconCheck width={15} height={15} /> : <IconCopy width={15} height={15} />} onClick={copy}>
                  {copied ? "Copiado" : "Copiar"}
                </Button>
                <a
                  href={enlaceTexto(mensaje)}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-ctl border border-border text-sm font-medium transition-colors duration-100 hover:border-fg/30 hover:bg-surface sm:h-9"
                >
                  <IconWhatsapp width={15} height={15} /> {grupo ? "Otro chat" : "Abrir WhatsApp"}
                </a>
              </div>
              {grupo && <p className="text-[11px] leading-relaxed text-muted">El grupo se abre sin el texto (WhatsApp no deja prellenarlo): solo pega con Ctrl+V o mantén presionado → Pegar.</p>}
            </div>
          </section>

          {event.evaluacion?.notas?.length > 0 && (
            <section>
              <h2 className="eyebrow mb-2 text-fg">Notas</h2>
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
              className={cx("rounded-ctl px-2.5 py-1 text-[13px]", preview === f.key ? "bg-subtle font-medium text-fg" : "text-muted hover:text-fg")}
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
          Se borra todo lo de <span className="font-medium text-fg">{event.nombre}</span>: la planilla, la lista de personal y las horas que se guardaron en Mis horas para este evento. No se puede deshacer.
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

/** Miniatura de documento: hoja blanca con renglones; abre la vista previa. */
function Miniatura({ grande, onClick, label }: { grande?: boolean; onClick: () => void; label: string }) {
  return (
    <button
      onClick={onClick}
      aria-label={label}
      className={cx(
        "relative grid shrink-0 place-items-center rounded-ctl border border-border bg-white shadow-sm transition-transform duration-100 hover:-translate-y-0.5",
        grande ? "h-24 w-[76px]" : "h-[60px] w-12",
      )}
    >
      <span className="absolute right-0 top-0 h-3 w-3 rounded-bl border-b border-l border-stone-200 bg-stone-100" />
      <span className={cx("space-y-1", grande && "space-y-1.5")}>
        <span className={cx("block h-[3px] rounded bg-brand", grande ? "w-9" : "w-6")} />
        <span className={cx("block h-[3px] rounded bg-stone-300", grande ? "w-9" : "w-6")} />
        <span className={cx("block h-[3px] rounded bg-stone-300", grande ? "w-6" : "w-4")} />
        <span className={cx("block h-[3px] rounded bg-stone-300", grande ? "w-8" : "w-5")} />
      </span>
    </button>
  );
}

/** Celular → app de WhatsApp. Computador → WhatsApp Web (sin la app instalada, los enlaces normales no abren nada). */
function esCelular() {
  return typeof navigator !== "undefined" && /Android|iPhone|iPad|iPod|Mobile/i.test(navigator.userAgent);
}

/** Abre el grupo: en el computador por WhatsApp Web con el código de la invitación. */
function enlaceGrupo(invitacion: string) {
  const codigo = /chat\.whatsapp\.com\/([A-Za-z0-9]+)/.exec(invitacion)?.[1];
  if (!codigo || esCelular()) return invitacion;
  return `https://web.whatsapp.com/accept?code=${codigo}`;
}

/** Abre WhatsApp con el mensaje ya escrito para elegir el chat. */
function enlaceTexto(texto: string) {
  const t = encodeURIComponent(texto);
  return esCelular() ? `https://wa.me/?text=${t}` : `https://web.whatsapp.com/send?text=${t}`;
}
