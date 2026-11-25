"use client";

import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSession } from "@/components/auth-provider";
import { DEPENDENCIAS, withDefaults } from "@/lib/schemas";
import { saveBlob, usePlaces } from "@/components/hooks";
import { IconChevron, IconDownload, IconPencil, IconPlus, IconTrash } from "@/components/icons";
import { useToast } from "@/components/toast";
import { Badge, Button, Field, Input, Modal, Notice, Select, Skeleton, cx } from "@/components/ui";
import { COLOR_DIA, estadoDia, mensajeDia } from "@/lib/registros";
import { deleteWorkLog, saveWorkLog, watchWorkLogs, type WorkLog } from "@/lib/data";
import { DIAS, MESES, formatCOP, formatMiles, hora12, normalize, formatDuracion } from "@/lib/format";

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
  /** coordinador para quien se trabajó: un nombre de la lista o escrito a mano */
  paraQuien: string;
  paraOtro: boolean;
  /** el valor se escribió a mano: ya no se recalcula con las horas */
  valorManual: boolean;
  origen: WorkLog["origen"];
}

const pad = (n: number) => String(n).padStart(2, "0");
const ymKey = (y: number, m: number) => `${y}-${pad(m + 1)}`;

function csvCell(v: string | number | null) {
  const s = v == null ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function nombreLugar(nombre: string) {
  return nombre.toLocaleLowerCase("es") === "otro" ? "OPC" : nombre;
}

const formatearNumero = formatMiles;

function llegadaCalculada(salida: string, horasTexto: string) {
  const horas = Number(horasTexto);
  if (!salida || !Number.isInteger(horas) || horas < 1 || horas > 24) return "";
  const [h, m] = salida.split(":").map(Number);
  const minutos = (h * 60 + m - horas * 60 + 1440) % 1440;
  return `${pad(Math.floor(minutos / 60))}:${pad(minutos % 60)}`;
}

export default function HorasPage() {
  const { user, profile } = useSession();
  const { places, teatroId } = usePlaces(user.uid);
  const coordinadores = withDefaults(profile.defaults).coordinadores;
  const todos = [...DEPENDENCIAS, ...Object.values(coordinadores).flat()];
  const valorHora = withDefaults(profile.defaults).valorHora;
  const toast = useToast();
  const [logs, setLogs] = useState<WorkLog[] | null>(null);
  const today = new Date();
  const [ym, setYm] = useState({ y: today.getFullYear(), m: today.getMonth() });
  const [lugar, setLugar] = useState("");
  const [evento, setEvento] = useState("");
  const [form, setForm] = useState<FormState | null>(null);
  const [toDelete, setToDelete] = useState<WorkLog | null>(null);

  useEffect(() => watchWorkLogs(user.uid, setLogs), [user.uid]);

  const placeName = useMemo(() => new Map((places ?? []).map((p) => [p.id, p.nombre])), [places]);
  const mes = ymKey(ym.y, ym.m);
  const delMes = useMemo(
    () =>
      (logs ?? [])
        .filter((l) => l.fecha.startsWith(mes) && (!lugar || l.placeId === lugar) && (!evento || normalize(l.evento).includes(normalize(evento))))
        .sort((a, b) => a.fecha.localeCompare(b.fecha)),
    [logs, mes, lugar, evento],
  );
  const total = delMes.reduce((a, l) => ({ horas: a.horas + (l.horas ?? 0), valor: a.valor + (l.valor ?? 0) }), { horas: 0, valor: 0 });
  const eventos = new Set(delMes.map((l) => l.eventId ?? l.evento + l.fecha)).size;

  // Comparación con el mes anterior
  const prevKey = ym.m === 0 ? ymKey(ym.y - 1, 11) : ymKey(ym.y, ym.m - 1);
  const prevHoras = (logs ?? []).filter((l) => l.fecha.startsWith(prevKey)).reduce((a, l) => a + (l.horas ?? 0), 0);

  const porLugar = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of delMes) m.set(l.placeId, (m.get(l.placeId) ?? 0) + (l.horas ?? 0));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [delMes]);
  const maxLugar = Math.max(1, ...porLugar.map(([, h]) => h));

  const porDia = useMemo(() => {
    const m = new Map<number, number>();
    for (const l of delMes) m.set(Number(l.fecha.slice(8, 10)), (m.get(Number(l.fecha.slice(8, 10))) ?? 0) + (l.horas ?? 0));
    return m;
  }, [delMes]);

  // Horas por fecha de todos los turnos (sin filtros): base de los avisos de más de 8 h.
  const horasDia = useMemo(() => {
    const m = new Map<string, number>();
    for (const l of logs ?? []) m.set(l.fecha, (m.get(l.fecha) ?? 0) + (l.horas ?? 0));
    return m;
  }, [logs]);
  const totalDelDia = (fecha: string, horas: number, sinId?: string) =>
    (logs ?? []).filter((l) => l.fecha === fecha && l.id !== sinId).reduce((a, l) => a + (l.horas ?? 0), 0) + horas;

  function moveMonth(delta: number) {
    setYm(({ y, m }) => {
      const d = new Date(y, m + delta, 1);
      return { y: d.getFullYear(), m: d.getMonth() };
    });
  }

  function openNew(fecha?: string) {
    setForm({
      fecha: fecha ?? (mes === ymKey(today.getFullYear(), today.getMonth()) ? today.toLocaleDateString("en-CA") : `${mes}-01`),
      evento: "",
      placeId: teatroId,
      llegada: "",
      salida: "",
      horas: "",
      valor: "",
      eventId: null,
      origen: "manual",
      paraQuien: "",
      paraOtro: false,
      valorManual: false,
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
      horas: l.horas != null ? String(Math.round(l.horas)) : "",
      valor: l.valor != null ? formatearNumero(String(l.valor)) : "",
      eventId: l.eventId,
      origen: l.origen,
      paraQuien: l.paraQuien ?? "",
      paraOtro: !!l.paraQuien && !todos.includes(l.paraQuien),
      valorManual: true,
    });
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!form) return;
    if (!form.fecha || !form.placeId) return toast.error("Completa la fecha y el lugar.");
    const horas = Number(form.horas);
    if (form.horas !== "" && horas == null) return toast.error("No entendí las horas.", "Escribe por ejemplo 5 o 5:30.");
    if (!form.horas || !Number.isInteger(horas) || horas < 1 || horas > 24) return toast.error("Escribe las horas completas", "Usa un número entero entre 1 y 24.");
    if (!form.salida || !llegadaCalculada(form.salida, form.horas)) return toast.error("Completa la hora de salida para calcular la llegada.");
    const { synced } = saveWorkLog(
      user.uid,
      {
        fecha: form.fecha,
        evento: form.evento.trim(),
        placeId: form.placeId,
        llegada: llegadaCalculada(form.salida, form.horas),
        salida: form.salida || null,
        horas,
        valor: form.valor === "" ? null : Number(form.valor.replace(/\D/g, "")),
        eventId: form.eventId,
        paraQuien: form.paraQuien.trim() || null,
        origen: form.origen,
      },
      form.id,
    );
    synced.catch(() => toast.error("No se pudo sincronizar un registro", "Revisa los datos e intenta de nuevo."));
    // Se guarda igual; solo se avisa si el día pasa de 8 h.
    const totalDia = totalDelDia(form.fecha, horas, form.id);
    if (estadoDia(totalDia) === "excedido") toast.warn("Ese día te pasaste de 8 h", mensajeDia(totalDia) ?? undefined);
    else toast.success(form.id ? "Registro actualizado" : "Horas guardadas", navigator.onLine ? undefined : "Se sincroniza cuando vuelva la conexión.");
    const [y, m] = form.fecha.split("-").map(Number);
    setYm({ y, m: m - 1 });
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
      ["Fecha", "Evento", "Lugar", "Para quién", "Llegada", "Salida", "Horas", "Valor"],
      ...delMes.map((l) => [l.fecha, l.evento, placeName.get(l.placeId) ?? "", l.paraQuien ?? "", l.llegada ?? "", l.salida ?? "", l.horas ?? "", l.valor ?? ""]),
      ["", "", "", "", "Total", total.horas, total.valor],
    ];
    const csv = "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
    saveBlob(new Blob([csv], { type: "text/csv;charset=utf-8" }), `mis-horas-${mes}.csv`);
  }

  const setF = (patch: Partial<FormState>) => setForm((f) => (f ? { ...f, ...patch } : f));
  // Horas: mientras el valor no se haya escrito a mano, se calcula horas × valor por hora.
  const setHoras = (h: number | string) =>
    setForm((f) => {
      if (!f) return f;
      const horas = String(h);
      const valor = f.valorManual ? f.valor : horas ? formatearNumero(String(Number(horas) * valorHora)) : "";
      return { ...f, horas, valor };
    });

  // Calendario (semana empieza el lunes)
  const first = new Date(ym.y, ym.m, 1);
  const offset = (first.getDay() + 6) % 7;
  const daysInMonth = new Date(ym.y, ym.m + 1, 0).getDate();
  const isThisMonth = ym.y === today.getFullYear() && ym.m === today.getMonth();
  const diff = total.horas - prevHoras;

  return (
    <>
      <div className="mb-8 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <p className="eyebrow">Mis horas</p>
          <div className="mt-1 flex items-center gap-1">
            <button onClick={() => moveMonth(-1)} className="-ml-2 grid h-9 w-9 place-items-center rounded-ctl text-muted hover:bg-subtle hover:text-fg" aria-label="Mes anterior">
              <IconChevron className="rotate-180" />
            </button>
            <h1 className="min-w-[200px] font-bold tracking-tight text-[28px] leading-tight sm:text-[32px]">
              {MESES[ym.m]} {ym.y}
            </h1>
            <button onClick={() => moveMonth(1)} className="grid h-9 w-9 place-items-center rounded-ctl text-muted hover:bg-subtle hover:text-fg" aria-label="Mes siguiente">
              <IconChevron />
            </button>
            {!isThisMonth && (
              <button onClick={() => setYm({ y: today.getFullYear(), m: today.getMonth() })} className="ml-2 text-[13px] font-medium text-brand underline-offset-2 hover:underline">
                Hoy
              </button>
            )}
          </div>
        </div>
        <div className="flex gap-2">
          <Button icon={<IconDownload />} onClick={exportCsv} disabled={!delMes.length}>
            CSV
          </Button>
          <Button variant="primary" icon={<IconPlus />} onClick={() => openNew()} disabled={!places}>
            Agregar horas
          </Button>
        </div>
      </div>

      {/* Cifras del mes */}
      <div className="mb-8 grid grid-cols-2 border-y border-border lg:grid-cols-4">
        {[
          {
            label: "Horas",
            value: formatDuracion(total.horas),
            sub: prevHoras || total.horas ? `${diff >= 0 ? "+" : ""}${formatDuracion(diff)} vs. mes anterior` : "Sin registros",
          },
          { label: "Pagado", value: formatCOP(total.valor), sub: total.horas ? `${formatCOP(total.valor / total.horas)} por hora` : "—" },
          { label: "Eventos", value: String(eventos), sub: `${porDia.size} ${porDia.size === 1 ? "día trabajado" : "días trabajados"}` },
          { label: "Promedio", value: eventos ? formatDuracion(total.horas / eventos) : "—", sub: "por evento" },
        ].map((k, i) => (
          <div key={k.label} className={cx("py-5", i % 2 === 1 ? "border-l border-border pl-5" : "pr-5", i >= 2 && "border-t border-border lg:border-t-0", i === 2 && "lg:border-l lg:pl-5")}>
            <p className="eyebrow">{k.label}</p>
            <p className="tabular mt-1 font-bold tracking-tight text-[28px] leading-tight">{k.value}</p>
            <p className="mt-1 text-xs text-muted">{k.sub}</p>
          </div>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_300px]">
        {/* Turnos */}
        <section className="min-w-0">
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <h2 className="w-full font-bold tracking-tight text-xl sm:mr-auto sm:w-auto">Turnos</h2>
            <div className="w-full sm:w-52">
            <Select className="h-8 text-[13px]" value={lugar} onChange={(e) => setLugar(e.target.value)} aria-label="Filtrar por lugar">
              <option value="">Todos los lugares</option>
              {places?.map((p) => (
                <option key={p.id} value={p.id}>
                  {nombreLugar(p.nombre)}
                </option>
              ))}
            </Select>
            </div>
            <div className="w-full sm:w-44">
              <Input className="h-8 text-[13px]" placeholder="Buscar evento" value={evento} onChange={(e) => setEvento(e.target.value)} />
            </div>
          </div>

          {logs === null ? (
            <Skeleton className="h-40 w-full" />
          ) : delMes.length === 0 ? (
            <div className="border-y border-border px-6 py-10 text-center">
              <p className="font-bold tracking-tight text-lg">Sin turnos en {MESES[ym.m].toLowerCase()}</p>
              <p className="mt-1 text-[13px] text-muted">Se agregan solos al generar una planilla, o escríbelos a mano.</p>
              <button onClick={() => openNew()} className="mt-3 text-[13px] font-medium text-brand underline-offset-2 hover:underline">
                Agregar un turno
              </button>
            </div>
          ) : (
            <ul className="divide-y divide-border border-y border-border">
              {delMes.map((l) => {
                const d = new Date(`${l.fecha}T12:00:00`);
                const diaEstado = estadoDia(horasDia.get(l.fecha) ?? 0);
                return (
                  <li key={l.id} className="group flex items-center gap-4 px-1 py-3 transition-colors duration-100 hover:bg-subtle/40 sm:px-2">
                    <div className="w-11 shrink-0 text-center">
                      <p className="text-[11px] uppercase tracking-[0.06em] text-muted">{DIAS[d.getDay()].slice(0, 3)}</p>
                      <p className={cx("tabular font-bold tracking-tight text-[22px] leading-none", diaEstado === "excedido" && "text-danger")}>{d.getDate()}</p>
                    </div>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium">
                        {l.evento || "Sin nombre"}
                        {l.pendiente && (
                          <span className="ml-2 align-middle">
                            <Badge tone="warn">sin sincronizar</Badge>
                          </span>
                        )}
                      </p>
                      <p className="tabular truncate text-xs text-muted">
                        {placeName.get(l.placeId) ?? "—"}
                        {l.paraQuien ? ` · para ${l.paraQuien}` : ""}
                        {l.llegada ? ` · ${hora12(l.llegada, true)} – ${hora12(l.salida, true)}` : ""}
                      </p>
                      {diaEstado === "excedido" && <p className="mt-0.5 text-xs text-danger">{mensajeDia(horasDia.get(l.fecha) ?? 0)}</p>}
                    </div>
                    <div className="text-right">
                      <p className="tabular whitespace-nowrap text-sm font-medium">{formatDuracion(l.horas)}</p>
                      <p className="tabular text-xs text-muted">{formatCOP(l.valor)}</p>
                    </div>
                    <div className="flex sm:opacity-0 sm:transition-opacity sm:group-hover:opacity-100 sm:group-focus-within:opacity-100">
                      <button onClick={() => openEdit(l)} className="grid h-9 w-9 place-items-center rounded-ctl text-faint hover:bg-subtle hover:text-fg" aria-label="Editar">
                        <IconPencil width={14} height={14} />
                      </button>
                      <button onClick={() => setToDelete(l)} className="grid h-9 w-9 place-items-center rounded-ctl text-faint hover:bg-subtle hover:text-danger" aria-label="Eliminar">
                        <IconTrash width={14} height={14} />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <aside className="min-w-0 space-y-6">
          {/* Calendario */}
          <section className="mx-auto w-full max-w-[340px] rounded-box border border-border bg-surface p-4 lg:max-w-none">
            <div className="mb-4 flex items-baseline justify-between">
              <p className="text-sm font-bold">{MESES[ym.m]}</p>
              <p className="tabular text-xs text-muted">
                {formatDuracion(total.horas)} · {porDia.size} {porDia.size === 1 ? "día" : "días"}
              </p>
            </div>
            <div className="grid grid-cols-7 gap-1.5 text-center">
              {["L", "M", "M", "J", "V", "S", "D"].map((d, i) => (
                <span key={i} className={cx("pb-1 text-[11px] font-medium", i >= 5 ? "text-faint" : "text-muted")}>
                  {d}
                </span>
              ))}
              {Array.from({ length: offset }).map((_, i) => (
                <span key={`e${i}`} />
              ))}
              {Array.from({ length: daysInMonth }, (_, i) => i + 1).map((day) => {
                // El color sale del total del día en todos los lugares, aunque haya filtros.
                const hDia = horasDia.get(`${mes}-${pad(day)}`) ?? 0;
                const isToday = isThisMonth && day === today.getDate();
                return (
                  <button
                    key={day}
                    onClick={() => openNew(`${mes}-${pad(day)}`)}
                    title={hDia ? (mensajeDia(hDia) ?? formatDuracion(hDia)) : "Agregar turno"}
                    aria-label={`${day} de ${MESES[ym.m].toLowerCase()}${hDia ? `, ${formatDuracion(hDia)}` : ""}${estadoDia(hDia) === "excedido" ? ", más de 8 h" : ""}`}
                    className={cx(
                      "tabular flex aspect-square flex-col items-center justify-center rounded-ctl leading-none transition-[background-color,transform] duration-100 active:scale-95",
                      hDia ? COLOR_DIA[estadoDia(hDia)] : "text-muted hover:bg-subtle hover:text-fg",
                      isToday && !hDia && "font-bold text-brand ring-1 ring-inset ring-brand/60",
                      isToday && hDia > 0 && "ring-2 ring-brand ring-offset-2 ring-offset-surface",
                    )}
                  >
                    <span className="text-[13px]">{day}</span>
                    {hDia > 0 && <span className="mt-0.5 text-[9px] font-medium opacity-80">{Number.isInteger(hDia) ? hDia : hDia.toFixed(1)} h</span>}
                  </button>
                );
              })}
            </div>
            <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-border pt-3">
              <ul className="flex flex-wrap gap-x-3 gap-y-1 text-[11px] text-muted">
                <li className="flex items-center gap-1.5">
                  <span className={cx("h-2 w-2 rounded-full", COLOR_DIA.normal)} />
                  Trabajado
                </li>
                <li className="flex items-center gap-1.5">
                  <span className={cx("h-2 w-2 rounded-full", COLOR_DIA.limite)} />8 h
                </li>
                <li className="flex items-center gap-1.5">
                  <span className={cx("h-2 w-2 rounded-full", COLOR_DIA.excedido)} />
                  Más de 8 h
                </li>
              </ul>
              <span className="text-[11px] text-faint">Toca un día para agregar</span>
            </div>
          </section>

          {/* Por lugar */}
          <section className="rounded-box border border-border bg-surface p-4">
            <div className="mb-4 flex items-baseline justify-between">
              <h2 className="text-sm font-bold">Por lugar</h2>
              {porLugar.length > 0 && <span className="tabular text-xs text-muted">{formatDuracion(total.horas)}</span>}
            </div>
            {porLugar.length === 0 ? (
              <p className="text-[13px] text-muted">Aún no hay horas este mes.</p>
            ) : (
              <ul className="space-y-4">
                {porLugar.map(([id, h], i) => (
                  <li key={id}>
                    <div className="mb-1.5 flex items-baseline justify-between gap-3 text-[13px]">
                      <span className="truncate">{nombreLugar(placeName.get(id) ?? "Lugar eliminado")}</span>
                      <span className="tabular shrink-0">
                        <span className="font-bold">{formatDuracion(h)}</span>
                        <span className="ml-1.5 text-xs text-muted">{Math.round((h / Math.max(1, total.horas)) * 100)}%</span>
                      </span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-subtle">
                      <div
                        className={cx("h-full rounded-full transition-[width] duration-300", i === 0 ? "bg-brand" : "bg-brand/45")}
                        style={{ width: `${Math.max(4, (h / maxLugar) * 100)}%` }}
                      />
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </aside>
      </div>

      <Modal
        open={!!form}
        onClose={() => setForm(null)}
        title={form?.id ? "Editar turno" : "Agregar turno"}
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
          <form id="worklog-form" onSubmit={submit} className="grid gap-5">
            <div className="grid grid-cols-[minmax(0,150px)_minmax(0,1fr)] gap-3">
              <Field label="Fecha">{(id) => <Input id={id} type="date" required value={form.fecha} onChange={(e) => setF({ fecha: e.target.value })} />}</Field>
              <Field label="Lugar">
                {(id) => (
                  <Select id={id} value={form.placeId} onChange={(e) => setF({ placeId: e.target.value })}>
                    {places?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {nombreLugar(p.nombre)}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
            </div>
            <Field label="Evento">{(id) => <Input id={id} value={form.evento} maxLength={160} onChange={(e) => setF({ evento: e.target.value })} placeholder="Ej. Grados mañana" />}</Field>
            <Field label="¿A quién le trabajaste? · opcional">
              {(id) => (
                <div className="space-y-2">
                  <Select
                    id={id}
                    value={form.paraOtro ? "__otro" : form.paraQuien}
                    onChange={(e) => (e.target.value === "__otro" ? setF({ paraOtro: true, paraQuien: "" }) : setF({ paraOtro: false, paraQuien: e.target.value }))}
                  >
                    <option value="">Nadie en particular</option>
                    <optgroup label="Dependencia">
                      {DEPENDENCIAS.map((d) => (
                        <option key={d} value={d}>
                          {d}
                        </option>
                      ))}
                    </optgroup>
                    {Object.entries(coordinadores).map(([grupo, nombres]) => (
                      <optgroup key={grupo} label={grupo}>
                        {nombres.map((n) => (
                          <option key={`${grupo}-${n}`} value={n}>
                            {n}
                          </option>
                        ))}
                      </optgroup>
                    ))}
                    <option value="__otro">Otra persona…</option>
                  </Select>
                  {form.paraOtro && (
                    <Input autoFocus value={form.paraQuien} maxLength={80} placeholder="Nombre de la persona" onChange={(e) => setF({ paraQuien: e.target.value })} />
                  )}
                </div>
              )}
            </Field>

            {/* Horario: salida + horas; la llegada sale sola */}
            <div className="rounded-box border border-border bg-subtle/50 p-4">
              <div className="grid grid-cols-2 gap-3">
                <Field label="Salida">
                  {(id) => <Input id={id} type="time" value={form.salida} onChange={(e) => setF({ salida: e.target.value })} />}
                </Field>
                <div className="space-y-1.5">
                  <span className="block text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Horas</span>
                  <div className="flex h-10 items-stretch overflow-hidden rounded-ctl border border-border bg-surface sm:h-9">
                    <button
                      type="button"
                      onClick={() => setHoras(Math.max(1, (Number(form.horas) || 1) - 1))}
                      className="w-10 text-lg text-muted transition-colors duration-100 hover:bg-subtle hover:text-fg"
                      aria-label="Una hora menos"
                    >
                      −
                    </button>
                    <input
                      inputMode="numeric"
                      aria-label="Horas"
                      value={form.horas}
                      placeholder="4"
                      onChange={(e) => setHoras(e.target.value.replace(/\D/g, "").slice(0, 2))}
                      className="tabular w-full min-w-0 border-x border-border bg-transparent text-center font-bold placeholder:font-normal placeholder:text-faint focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setHoras(Math.min(24, (Number(form.horas) || 0) + 1))}
                      className="w-10 text-lg text-muted transition-colors duration-100 hover:bg-subtle hover:text-fg"
                      aria-label="Una hora más"
                    >
                      +
                    </button>
                  </div>
                </div>
              </div>
              <p className="tabular mt-3 text-[13px]">
                {form.salida && llegadaCalculada(form.salida, form.horas) ? (
                  <>
                    <span className="text-muted">De </span>
                    <span className="font-medium">{hora12(llegadaCalculada(form.salida, form.horas), true)}</span>
                    <span className="text-muted"> a </span>
                    <span className="font-medium">{hora12(form.salida, true)}</span>
                    <span className="text-muted"> · {form.horas} h</span>
                  </>
                ) : (
                  <span className="text-muted">Pon la salida y las horas: la llegada se calcula sola.</span>
                )}
              </p>
            </div>

            <Field label="Valor" hint={!form.valorManual && form.horas ? `${form.horas} h × ${formatCOP(valorHora)}. Puedes cambiarlo.` : undefined}>
              {(id) => (
                <div className="relative">
                  <span className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-muted">$</span>
                  <Input id={id} inputMode="numeric" className="tabular pl-7" value={form.valor} onChange={(e) => setF({ valor: formatearNumero(e.target.value), valorManual: true })} placeholder="10.000" />
                </div>
              )}
            </Field>

            {(() => {
              const t = form.horas ? totalDelDia(form.fecha, Number(form.horas), form.id) : 0;
              const m = mensajeDia(t);
              return m ? (
                <Notice tone={estadoDia(t) === "excedido" ? "danger" : "warn"}>
                  {m} Puedes guardarlo igual; la cuenta de cobro solo usa el consolidado.
                </Notice>
              ) : null;
            })()}
          </form>
        )}
      </Modal>

      <Modal
        open={!!toDelete}
        onClose={() => setToDelete(null)}
        title="Eliminar turno"
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
          ¿Eliminar las horas de <span className="font-medium text-fg">{toDelete?.evento || "este turno"}</span> del {toDelete?.fecha}?
        </p>
      </Modal>
    </>
  );
}
