"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSession } from "@/components/auth-provider";
import { saveBlob, usePlaces } from "@/components/hooks";
import { IconClock, IconDownload, IconPencil, IconPlus, IconTrash } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, EmptyState, Field, Input, Modal, PageHeader, Select, Skeleton, Stat } from "@/components/ui";
import { deleteWorkLog, saveWorkLog, watchWorkLogs, type WorkLog } from "@/lib/data";
import { MESES, diffHoras, fechaCorta, formatCOP, formatHoras, hora12, normalize } from "@/lib/format";

const mesLabel = (m: string) => `${MESES[Number(m.slice(5)) - 1]} ${m.slice(0, 4)}`;

interface FormState {
  id?: string;
  fecha: string;
  evento: string;
  placeId: string;
  llegada: string;
  salida: string;
  horas: string;
  valor: string;
  eventId: string | null;
  origen: WorkLog["origen"];
}

function csvCell(v: string | number | null) {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export default function HorasPage() {
  const { user } = useSession();
  const { places, teatroId } = usePlaces(user.uid);
  const toast = useToast();
  const [logs, setLogs] = useState<WorkLog[] | null>(null);
  const [mes, setMes] = useState("");
  const [lugar, setLugar] = useState("");
  const [evento, setEvento] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [toDelete, setToDelete] = useState<WorkLog | null>(null);

  useEffect(() => watchWorkLogs(user.uid, setLogs), [user.uid]);

  const placeName = useMemo(() => new Map((places ?? []).map((p) => [p.id, p.nombre])), [places]);
  const meses = useMemo(() => [...new Set((logs ?? []).map((l) => l.fecha.slice(0, 7)))], [logs]);

  const filtered = useMemo(
    () =>
      (logs ?? []).filter(
        (l) =>
          (!mes || l.fecha.startsWith(mes)) &&
          (!lugar || l.placeId === lugar) &&
          (!evento || normalize(l.evento).includes(normalize(evento))),
      ),
    [logs, mes, lugar, evento],
  );

  const total = filtered.reduce((a, l) => ({ horas: a.horas + (l.horas ?? 0), valor: a.valor + (l.valor ?? 0) }), { horas: 0, valor: 0 });

  function groupBy(key: (l: WorkLog) => string) {
    const m = new Map<string, { horas: number; valor: number; n: number }>();
    for (const l of filtered) {
      const k = key(l);
      const g = m.get(k) ?? { horas: 0, valor: 0, n: 0 };
      g.horas += l.horas ?? 0;
      g.valor += l.valor ?? 0;
      g.n++;
      m.set(k, g);
    }
    return [...m.entries()];
  }
  const porMes = groupBy((l) => l.fecha.slice(0, 7)).sort((a, b) => b[0].localeCompare(a[0]));
  const porLugar = groupBy((l) => l.placeId).sort((a, b) => b[1].horas - a[1].horas);

  function openNew() {
    setForm({
      fecha: new Date().toLocaleDateString("en-CA"),
      evento: "",
      placeId: teatroId,
      llegada: "",
      salida: "",
      horas: "",
      valor: "",
      eventId: null,
      origen: "manual",
    });
  }

  function openEdit(l: WorkLog) {
    setForm({
      id: l.id,
      fecha: l.fecha,
      evento: l.evento,
      placeId: l.placeId,
      llegada: l.llegada ?? "",
      salida: l.salida ?? "",
      horas: l.horas != null ? String(l.horas) : "",
      valor: l.valor != null ? String(l.valor) : "",
      eventId: l.eventId,
      origen: l.origen,
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.fecha || !form.placeId) return toast.error("Completa la fecha y el lugar.");
    const horas = form.horas === "" ? diffHoras(form.llegada || null, form.salida || null) : Number(form.horas.replace(",", "."));
    if (horas != null && (Number.isNaN(horas) || horas < 0 || horas > 24)) return toast.error("Las horas deben estar entre 0 y 24.");
    const { synced } = saveWorkLog(
      user.uid,
      {
        fecha: form.fecha,
        evento: form.evento.trim(),
        placeId: form.placeId,
        llegada: form.llegada || null,
        salida: form.salida || null,
        horas,
        valor: form.valor === "" ? null : Number(form.valor),
        eventId: form.eventId,
        origen: form.origen,
      },
      form.id,
    );
    synced.catch(() => toast.error("No se pudo sincronizar un registro", "Revisa los datos e intenta de nuevo."));
    toast.success(form.id ? "Registro actualizado" : "Horas guardadas", navigator.onLine ? undefined : "Se sincronizará cuando vuelva la conexión.");
    setForm(null);
  }

  function confirmDelete() {
    if (!toDelete) return;
    deleteWorkLog(toDelete.id).catch(() => toast.error("No se pudo eliminar"));
    toast.success("Registro eliminado");
    setToDelete(null);
  }

  function exportCsv() {
    const rows = [
      ["Fecha", "Evento", "Lugar", "Llegada", "Salida", "Horas", "Valor"],
      ...filtered.map((l) => [l.fecha, l.evento, placeName.get(l.placeId) ?? "", l.llegada ?? "", l.salida ?? "", l.horas ?? "", l.valor ?? ""]),
      ["", "", "", "", "Total", total.horas, total.valor],
    ];
    const csv = "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
    saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `mis-horas${mes ? "-" + mes : ""}.csv`);
  }

  const setF = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));

  return (
    <>
      <PageHeader
        title="Mis horas"
        description="Tus horas y pagos por evento y lugar de trabajo."
        action={
          <>
            <Button icon={<IconDownload />} onClick={exportCsv} disabled={!filtered.length}>
              CSV
            </Button>
            <Button variant="primary" icon={<IconPlus />} onClick={openNew} disabled={!places}>
              Agregar
            </Button>
          </>
        }
      />

      {logs === null ? (
        <Skeleton className="h-48 w-full" />
      ) : logs.length === 0 ? (
        <Card>
          <EmptyState
            icon={<IconClock />}
            title="Todavía no hay horas registradas"
            description="Se agregan solas al generar una planilla, o puedes escribirlas a mano."
            action={
              <Button variant="primary" icon={<IconPlus />} onClick={openNew} disabled={!places}>
                Agregar horas
              </Button>
            }
          />
        </Card>
      ) : (
        <>
          <div className="mb-4 grid grid-cols-3 gap-3">
            <Stat label="Registros" value={filtered.length} />
            <Stat label="Horas" value={formatHoras(total.horas)} />
            <Stat label="Valor" value={formatCOP(total.valor)} />
          </div>

          <div className="mb-3 grid gap-2 sm:grid-cols-3">
            <Select value={mes} onChange={(e) => setMes(e.target.value)} aria-label="Filtrar por mes">
              <option value="">Todos los meses</option>
              {meses.map((m) => (
                <option key={m} value={m}>
                  {mesLabel(m)}
                </option>
              ))}
            </Select>
            <Select value={lugar} onChange={(e) => setLugar(e.target.value)} aria-label="Filtrar por lugar">
              <option value="">Todos los lugares</option>
              {places?.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.nombre}
                </option>
              ))}
            </Select>
            <Input placeholder="Filtrar por evento" value={evento} onChange={(e) => setEvento(e.target.value)} />
          </div>

          <Card className="mb-5">
            {filtered.length === 0 ? (
              <p className="px-5 py-10 text-center text-[13px] text-muted">Ningún registro coincide con los filtros.</p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full min-w-[640px] text-[13px]">
                  <thead>
                    <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
                      <th className="py-2 pl-5 font-medium">Fecha</th>
                      <th className="py-2 font-medium">Evento</th>
                      <th className="py-2 font-medium">Lugar</th>
                      <th className="py-2 font-medium">Horario</th>
                      <th className="py-2 text-right font-medium">Horas</th>
                      <th className="py-2 text-right font-medium">Valor</th>
                      <th className="w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((l) => (
                      <tr key={l.id} className="group border-b border-border/60 last:border-0">
                        <td className="tabular whitespace-nowrap py-2 pl-5 text-muted">{fechaCorta(l.fecha)}</td>
                        <td className="py-2">
                          <span className="font-medium">{l.evento || "—"}</span>
                          {l.pendiente && (
                            <span className="ml-2">
                              <Badge tone="warn">sin sincronizar</Badge>
                            </span>
                          )}
                        </td>
                        <td className="py-2 text-muted">{placeName.get(l.placeId) ?? "—"}</td>
                        <td className="tabular whitespace-nowrap py-2 text-muted">
                          {l.llegada ? `${hora12(l.llegada, true)} – ${hora12(l.salida, true)}` : "—"}
                        </td>
                        <td className="tabular py-2 text-right">{formatHoras(l.horas)}</td>
                        <td className="tabular py-2 text-right">{formatCOP(l.valor)}</td>
                        <td className="py-1 pr-3 text-right">
                          <div className="inline-flex opacity-100 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                            <button onClick={() => openEdit(l)} className="grid h-7 w-7 place-items-center rounded text-faint hover:bg-subtle hover:text-fg" aria-label="Editar">
                              <IconPencil width={14} height={14} />
                            </button>
                            <button onClick={() => setToDelete(l)} className="grid h-7 w-7 place-items-center rounded text-faint hover:bg-subtle hover:text-danger" aria-label="Eliminar">
                              <IconTrash width={14} height={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </Card>

          <div className="grid gap-5 md:grid-cols-2">
            <Card>
              <CardHeader title="Por mes" />
              <Totals rows={porMes.map(([k, g]) => [mesLabel(k), g])} />
            </Card>
            <Card>
              <CardHeader title="Por lugar" />
              <Totals rows={porLugar.map(([k, g]) => [placeName.get(k) ?? "Lugar eliminado", g])} />
            </Card>
          </div>
        </>
      )}

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Editar horas" : "Agregar horas"}
        footer={
          <>
            <Button onClick={() => setForm(null)}>Cancelar</Button>
            <Button variant="primary" type="submit" form="worklog-form">
              Guardar
            </Button>
          </>
        }
      >
        {form && (
          <form id="worklog-form" onSubmit={submit} className="grid gap-4">
            <div className="grid grid-cols-2 gap-3">
              <Field label="Fecha">{(id) => <Input id={id} type="date" required value={form.fecha} onChange={(e) => setF({ fecha: e.target.value })} />}</Field>
              <Field label="Lugar">
                {(id) => (
                  <Select id={id} value={form.placeId} onChange={(e) => setF({ placeId: e.target.value })}>
                    {places?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Evento">{(id) => <Input id={id} value={form.evento} maxLength={160} onChange={(e) => setF({ evento: e.target.value })} placeholder="Ej. Grados mañana" />}</Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Llegada">
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    value={form.llegada}
                    onChange={(e) => setF({ llegada: e.target.value, horas: String(diffHoras(e.target.value || null, form.salida || null) ?? form.horas) })}
                  />
                )}
              </Field>
              <Field label="Salida">
                {(id) => (
                  <Input
                    id={id}
                    type="time"
                    value={form.salida}
                    onChange={(e) => setF({ salida: e.target.value, horas: String(diffHoras(form.llegada || null, e.target.value || null) ?? form.horas) })}
                  />
                )}
              </Field>
              <Field label="Horas">{(id) => <Input id={id} inputMode="decimal" value={form.horas} onChange={(e) => setF({ horas: e.target.value })} />}</Field>
              <Field label="Valor">{(id) => <Input id={id} inputMode="numeric" value={form.valor} onChange={(e) => setF({ valor: e.target.value.replace(/\D/g, "") })} placeholder="60000" />}</Field>
            </div>
          </form>
        )}
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Eliminar registro"
        footer={
          <>
            <Button onClick={() => setToDelete(null)}>Cancelar</Button>
            <Button variant="danger" onClick={confirmDelete}>
              Eliminar
            </Button>
          </>
        }
      >
        <p className="text-sm text-muted">
          ¿Eliminar las horas de <span className="font-medium text-fg">{toDelete?.evento || "este registro"}</span> del {toDelete && fechaCorta(toDelete.fecha)}?
        </p>
      </Modal>
    </>
  );
}

function Totals({ rows }: { rows: Array<[string, { horas: number; valor: number; n: number }]> }) {
  if (!rows.length) return <p className="px-5 py-6 text-center text-[13px] text-muted">Sin datos.</p>;
  return (
    <ul className="divide-y divide-border">
      {rows.map(([label, g]) => (
        <li key={label} className="flex items-center gap-3 px-4 py-2.5 text-[13px] sm:px-5">
          <span className="min-w-0 flex-1 truncate">{label}</span>
          <span className="tabular text-faint">{g.n}</span>
          <span className="tabular w-14 text-right">{formatHoras(g.horas)} h</span>
          <span className="tabular w-24 text-right font-medium">{formatCOP(g.valor)}</span>
        </li>
      ))}
    </ul>
  );
}
