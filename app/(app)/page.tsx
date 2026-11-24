"use client";

import { useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type FormEvent } from "react";
import { useSession } from "@/components/auth-provider";
import { Dropzone } from "@/components/dropzone";
import { usePlaces } from "@/components/hooks";
import { IconAlert, IconFile, IconX } from "@/components/icons";
import { newStaffRow, StaffEditor, staffTotals, type StaffDraft } from "@/components/staff-editor";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, CardHeader, Field, Input, PageHeader, Select, Textarea } from "@/components/ui";
import { apiJson } from "@/lib/firebase/client";
import { diffHoras, findBestNameMatch, formatCOP, formatHoras, isIsoDate } from "@/lib/format";
import type { Registro, StaffRow } from "@/lib/registro/types";
import type { GenerateInput } from "@/lib/schemas";

interface Draft {
  origen: string | null; // nombre del archivo o null si es manual
  evento: string;
  fecha: string;
  horaCitacion: string;
  horaEvento: string;
  aforo: string;
  nota: string;
  observaciones: string;
  objetosPerdidos: string;
  staff: StaffDraft[];
  warnings: string[];
}

interface MyHours {
  guardar: boolean;
  rowKey: string; // "" = sin fila
  placeId: string;
  llegada: string;
  salida: string;
  horas: string;
  valor: string;
}

const toDraftRow = (s: StaffRow): StaffDraft => ({
  key: Math.random().toString(36).slice(2),
  nombre: s.nombre,
  cargo: s.cargo,
  llegada: s.llegada,
  salida: s.salida,
  horas: s.horas,
  valor: s.valor,
  pp: s.pp,
  desempeno: s.desempeno,
});

function hoursFromRow(r: StaffDraft | undefined): Pick<MyHours, "llegada" | "salida" | "horas" | "valor"> {
  return {
    llegada: r?.llegada ?? "",
    salida: r?.salida ?? "",
    horas: r?.horas != null ? String(r.horas) : "",
    valor: r?.valor != null ? String(r.valor) : "",
  };
}

export default function NuevaPlanillaPage() {
  const { profile, user } = useSession();
  const { places, teatroId } = usePlaces(user.uid);
  const toast = useToast();
  const router = useRouter();

  const [parsing, setParsing] = useState(false);
  const [manualReason, setManualReason] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mine, setMine] = useState<MyHours | null>(null);
  const [showStaff, setShowStaff] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);

  function start(base: Partial<Draft>, rows: StaffDraft[]) {
    const d: Draft = {
      origen: null,
      evento: "",
      fecha: "",
      horaCitacion: "",
      horaEvento: "",
      aforo: "",
      nota: profile.defaults?.nota ?? "",
      observaciones: profile.defaults?.observaciones ?? "",
      objetosPerdidos: profile.defaults?.objetosPerdidos ?? "",
      warnings: [],
      ...base,
      staff: rows,
    };
    const idx = findBestNameMatch(profile.nombre, rows);
    const row = idx >= 0 ? rows[idx] : undefined;
    setDraft(d);
    setMine({ guardar: true, rowKey: row?.key ?? "", placeId: "", ...hoursFromRow(row) });
    setShowStaff(rows.length === 0);
    setErrors({});
  }

  // El lugar por defecto llega cuando cargan los lugares.
  useEffect(() => {
    if (mine && !mine.placeId && teatroId) setMine({ ...mine, placeId: teatroId });
  }, [mine, teatroId]);

  async function onFile(file: File) {
    setParsing(true);
    setManualReason(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const r = await apiJson<Registro<StaffRow>>("/api/parse", { method: "POST", body });
      start(
        {
          origen: file.name,
          evento: r.evento,
          fecha: r.fecha ?? "",
          horaCitacion: r.horaCitacion ?? "",
          horaEvento: r.horaEvento ?? "",
          warnings: r.warnings,
        },
        r.staff.map(toDraftRow),
      );
    } catch (err) {
      const e = err as Error & { status?: number };
      if (e.status === 422) {
        // Formato no reconocido o PDF escaneado: formulario manual completo.
        setManualReason(e.message);
        start({ origen: file.name }, [newStaffRow()]);
      } else {
        toast.error("No se pudo leer el archivo", e.message);
      }
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setDraft(null);
    setMine(null);
    setManualReason(null);
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setM = (patch: Partial<MyHours>) => setMine((m) => (m ? { ...m, ...patch } : m));

  const matchedRow = useMemo(() => draft?.staff.find((r) => r.key === mine?.rowKey), [draft, mine?.rowKey]);
  const totals = draft ? staffTotals(draft.staff) : { horas: 0, valor: 0 };

  function validate(d: Draft): Record<string, string> {
    const e: Record<string, string> = {};
    if (!d.evento.trim()) e.evento = "Escribe el nombre del evento.";
    if (!isIsoDate(d.fecha)) e.fecha = "Elige la fecha.";
    if (!/^\d{2}:\d{2}$/.test(d.horaCitacion)) e.horaCitacion = "Falta la hora de citación.";
    if (!/^\d{2}:\d{2}$/.test(d.horaEvento)) e.horaEvento = "Falta la hora del evento.";
    if (d.aforo === "" || !/^\d+$/.test(d.aforo)) e.aforo = "Escribe el aforo (número de personas).";
    if (d.staff.some((r) => !r.nombre.trim())) e.staff = "Hay filas de personal sin nombre: complétalas o quítalas.";
    if (mine?.guardar && !mine.placeId) e.mine = "Elige el lugar de trabajo.";
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!draft || !mine) return;
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length) {
      if (e.staff) setShowStaff(true);
      toast.error("Revisa el formulario", Object.values(e)[0]);
      return;
    }
    const payload: GenerateInput = {
      evento: draft.evento.trim(),
      fecha: draft.fecha,
      horaCitacion: draft.horaCitacion,
      horaEvento: draft.horaEvento,
      aforo: Number(draft.aforo),
      nota: draft.nota.trim(),
      observaciones: draft.observaciones.trim(),
      objetosPerdidos: draft.objetosPerdidos.trim(),
      staff: draft.staff.map(({ key: _k, ...r }) => ({ ...r, nombre: r.nombre.trim() })),
      workLog: mine.guardar
        ? {
            placeId: mine.placeId,
            llegada: mine.llegada || null,
            salida: mine.salida || null,
            horas: mine.horas === "" ? diffHoras(mine.llegada || null, mine.salida || null) : Number(mine.horas.replace(",", ".")),
            valor: mine.valor === "" ? null : Number(mine.valor.replace(/\D/g, "")),
          }
        : null,
    };
    setGenerating(true);
    try {
      const res = await apiJson<{ eventId: string }>("/api/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      toast.success("Planillas generadas", mine.guardar ? "Tus horas quedaron guardadas en Mis horas." : undefined);
      router.push(`/planillas/${res.eventId}`);
    } catch (err) {
      toast.error("No se pudieron generar", (err as Error).message);
      setGenerating(false);
    }
  }

  if (!draft || !mine) {
    return (
      <>
        <PageHeader title="Nueva planilla" description="Sube el registro de personal y genera LLAVES, COLILLAS y EVALUACIÓN." />
        <Dropzone onFile={onFile} onError={(m) => toast.error(m)} busy={parsing} busyLabel="Leyendo el registro…" />
        <div className="mt-4 flex flex-col items-center gap-1 text-center text-[13px] text-muted">
          <p>El archivo se procesa en memoria y no se guarda. Cédulas y teléfonos nunca se almacenan.</p>
          <button className="font-medium text-fg hover:underline" onClick={() => start({}, [])}>
            Llenar los datos a mano
          </button>
        </div>
      </>
    );
  }

  return (
    <form onSubmit={submit} noValidate>
      <PageHeader
        title="Confirma los datos"
        description={
          draft.origen ? (
            <span className="inline-flex items-center gap-1.5">
              <IconFile width={14} height={14} /> {draft.origen}
            </span>
          ) : (
            "Entrada manual"
          )
        }
        action={
          <Button type="button" variant="ghost" icon={<IconX />} onClick={reset}>
            Empezar de nuevo
          </Button>
        }
      />

      {manualReason && (
        <div className="mb-5 flex gap-3 rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-[13px]">
          <IconAlert className="mt-0.5 shrink-0 text-warn" />
          <div>
            <p className="font-medium">No pudimos leer este archivo automáticamente.</p>
            <p className="mt-0.5 text-muted">{manualReason} Completa los datos a mano; el resultado es el mismo.</p>
          </div>
        </div>
      )}
      {!manualReason && draft.warnings.length > 0 && (
        <div className="mb-5 flex gap-3 rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-[13px]">
          <IconAlert className="mt-0.5 shrink-0 text-warn" />
          <ul className="space-y-0.5">
            {draft.warnings.map((w) => (
              <li key={w}>{w} Complétalo abajo.</li>
            ))}
          </ul>
        </div>
      )}

      <div className="space-y-5">
        <Card>
          <CardHeader title="Evento" />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
            <Field label="Nombre del evento" error={errors.evento} className="sm:col-span-2">
              {(id) => <Input id={id} value={draft.evento} onChange={(e) => set("evento", e.target.value)} placeholder="RED DE ESCUELAS" />}
            </Field>
            <Field label="Fecha" error={errors.fecha}>
              {(id) => <Input id={id} type="date" value={draft.fecha} onChange={(e) => set("fecha", e.target.value)} />}
            </Field>
            <Field label="Aforo" hint="Personas aproximadas" error={errors.aforo}>
              {(id) => (
                <Input
                  id={id}
                  inputMode="numeric"
                  value={draft.aforo}
                  onChange={(e) => set("aforo", e.target.value.replace(/\D/g, ""))}
                  placeholder="500"
                  autoFocus={!!draft.origen && !manualReason}
                />
              )}
            </Field>
            <Field label="Hora de citación" error={errors.horaCitacion}>
              {(id) => <Input id={id} type="time" value={draft.horaCitacion} onChange={(e) => set("horaCitacion", e.target.value)} />}
            </Field>
            <Field label="Hora del evento" error={errors.horaEvento}>
              {(id) => <Input id={id} type="time" value={draft.horaEvento} onChange={(e) => set("horaEvento", e.target.value)} />}
            </Field>
          </div>
        </Card>

        <Card>
          <CardHeader title="Reporte" description="Nota para LLAVES y EVALUACIÓN; observaciones y objetos perdidos para el mensaje de WhatsApp." />
          <div className="grid gap-4 p-4 sm:p-5">
            <Field label="Nota" hint="Opcional. Va en LLAVES y como viñeta en EVALUACIÓN.">
              {(id) => <Textarea id={id} rows={2} value={draft.nota} onChange={(e) => set("nota", e.target.value)} />}
            </Field>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="Observaciones">
                {(id) => <Textarea id={id} rows={2} value={draft.observaciones} onChange={(e) => set("observaciones", e.target.value)} />}
              </Field>
              <Field label="Objetos perdidos">
                {(id) => <Textarea id={id} rows={2} value={draft.objetosPerdidos} onChange={(e) => set("objetosPerdidos", e.target.value)} />}
              </Field>
            </div>
          </div>
        </Card>

        <Card>
          <CardHeader
            title="Personal"
            description={
              draft.staff.length ? (
                <span className="tabular">
                  {draft.staff.length} personas · {formatHoras(totals.horas)} h · {formatCOP(totals.valor)}
                </span>
              ) : (
                "Sin personal registrado"
              )
            }
            action={
              <Button type="button" size="sm" onClick={() => setShowStaff((s) => !s)}>
                {showStaff ? "Ocultar" : "Revisar"}
              </Button>
            }
          />
          {showStaff && (
            <div className="p-4 pt-2 sm:p-5 sm:pt-2">
              <StaffEditor rows={draft.staff} onChange={(rows) => set("staff", rows)} highlight={mine.rowKey} />
              {errors.staff && <p className="mt-2 text-xs text-danger">{errors.staff}</p>}
            </div>
          )}
        </Card>

        <Card>
          <CardHeader
            title="Mis horas"
            description={
              matchedRow ? (
                <>
                  Encontramos tu fila: <span className="font-medium text-fg">{matchedRow.nombre}</span>
                </>
              ) : draft.staff.length ? (
                "No encontramos tu nombre en la tabla. Elige tu fila o escribe tus horas."
              ) : (
                "Registra tus horas de este evento."
              )
            }
            action={
              <label className="flex items-center gap-2 text-[13px]">
                <input type="checkbox" checked={mine.guardar} onChange={(e) => setM({ guardar: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                Guardar
              </label>
            }
          />
          {mine.guardar && (
            <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5">
              {draft.staff.length > 0 && (
                <Field label="Tu fila en el registro">
                  {(id) => (
                    <Select
                      id={id}
                      value={mine.rowKey}
                      onChange={(e) => {
                        const row = draft.staff.find((r) => r.key === e.target.value);
                        setM({ rowKey: e.target.value, ...hoursFromRow(row) });
                      }}
                    >
                      <option value="">— Ninguna (escribir a mano) —</option>
                      {draft.staff.map((r, i) => (
                        <option key={r.key} value={r.key}>
                          {i + 1}. {r.nombre || "(sin nombre)"} {r.cargo ? `· ${r.cargo}` : ""}
                        </option>
                      ))}
                    </Select>
                  )}
                </Field>
              )}
              <Field label="Lugar de trabajo" error={errors.mine}>
                {(id) => (
                  <Select id={id} value={mine.placeId} onChange={(e) => setM({ placeId: e.target.value })} disabled={!places}>
                    {!places && <option>Cargando…</option>}
                    {places?.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.nombre}
                      </option>
                    ))}
                  </Select>
                )}
              </Field>
              <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
                <Field label="Llegada">
                  {(id) => (
                    <Input
                      id={id}
                      type="time"
                      value={mine.llegada}
                      onChange={(e) => setM({ llegada: e.target.value, horas: String(diffHoras(e.target.value || null, mine.salida || null) ?? mine.horas) })}
                    />
                  )}
                </Field>
                <Field label="Salida">
                  {(id) => (
                    <Input
                      id={id}
                      type="time"
                      value={mine.salida}
                      onChange={(e) => setM({ salida: e.target.value, horas: String(diffHoras(mine.llegada || null, e.target.value || null) ?? mine.horas) })}
                    />
                  )}
                </Field>
                <Field label="Horas">
                  {(id) => <Input id={id} inputMode="decimal" className="tabular" value={mine.horas} onChange={(e) => setM({ horas: e.target.value })} />}
                </Field>
                <Field label="Valor">
                  {(id) => (
                    <Input id={id} inputMode="numeric" className="tabular" value={mine.valor} onChange={(e) => setM({ valor: e.target.value.replace(/\D/g, "") })} placeholder="60000" />
                  )}
                </Field>
              </div>
            </div>
          )}
        </Card>
      </div>

      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border md:bottom-4">
        <div className="flex items-center justify-between gap-3">
          <div className="hidden min-w-0 text-[13px] text-muted sm:block">
            Se generan <Badge>LLAVES</Badge> <Badge>COLILLAS</Badge> <Badge>EVALUACIÓN</Badge>
          </div>
          <Button type="submit" variant="primary" loading={generating} className="w-full sm:w-auto">
            {generating ? "Generando…" : "Generar planillas"}
          </Button>
        </div>
      </div>
    </form>
  );
}
