"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSession } from "@/components/auth-provider";
import { Dropzone } from "@/components/dropzone";
import { FirmaEditor } from "@/components/firma/firma-editor";
import { usePlaces } from "@/components/hooks";
import { IconAlert, IconFile, IconPencil, IconPlus, IconTrash, IconX } from "@/components/icons";
import { horasDe, nuevaPersona, RegistroTable, type PersonaDraft } from "@/components/registro-table";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Modal, PageHeader, Select, Textarea, cx } from "@/components/ui";
import { apiFetch } from "@/lib/firebase/client";
import { diffHoras, findBestNameMatch, formatCOP, hora12, isIsoDate, parseDuracion, formatDuracion } from "@/lib/format";
import { calcularRegistro, fromMin, HORAS_BASE, mensajeSupuestas, prepararPersonal, salidaSugerida, toMin } from "@/lib/registro/calculo";
import type { Registro, StaffRow } from "@/lib/registro/types";
import { guardarRegistro, base64ToBlob } from "@/lib/registro-memoria";
import { withDefaults, type GenerateInput } from "@/lib/schemas";

type LocKey = "lc" | "ll" | "bc" | "bl";
const LOCS: Array<{ key: LocKey; label: string }> = [
  { key: "lc", label: "Luneta centro" },
  { key: "ll", label: "Luneta lateral" },
  { key: "bc", label: "Balcón centro" },
  { key: "bl", label: "Balcón lateral" },
];

interface Draft {
  archivo: File | null;
  evento: string;
  fecha: string;
  horaCitacion: string;
  horaEvento: string;
  salida: string;
  salidaEditada: boolean;
  /** salida escrita en el archivo (la más común), si la había */
  salidaArchivo: string | null;
  /** horas base del evento (las de los acomodadores) */
  base: string;
  aforo: string;
  personas: PersonaDraft[];
  warnings: string[];
  notaLlaves: string;
  reclamos: string;
  aspectosMejorar: string;
  aspectosPermanecer: string;
  sugerencias: string;
  notas: string[];
  localidades: Record<LocKey, { boletas: string; valor: string; observacion: string }>;
  observaciones: string;
  objetosPerdidos: string;
}

interface MyHours {
  guardar: boolean;
  fila: string; // key de la persona, "" = a mano
  placeId: string;
  llegada: string;
  salida: string;
  horas: string;
  valor: string;
}

const emptyLoc = () => ({ boletas: "", valor: "", observacion: "" });
const toInt = (s: string) => (s.trim() === "" ? null : Number(s.replace(/\D/g, "")));

export default function NuevaPlanillaPage() {
  const { profile, user } = useSession();
  const defaults = withDefaults(profile.defaults);
  const extras = { ac: defaults.extraAC, c: defaults.extraC };
  const { places, teatroId } = usePlaces(user.uid);
  const toast = useToast();
  const router = useRouter();

  const [parsing, setParsing] = useState(false);
  const [manualReason, setManualReason] = useState<string | null>(null);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [mine, setMine] = useState<MyHours | null>(null);
  const [firmaEvento, setFirmaEvento] = useState<Blob | null>(null);
  const [firmaEventoUrl, setFirmaEventoUrl] = useState<string | null>(null);
  const [firmando, setFirmando] = useState(false);
  const [showLocs, setShowLocs] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const formTop = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!firmaEvento) return setFirmaEventoUrl(null);
    const u = URL.createObjectURL(firmaEvento);
    setFirmaEventoUrl(u);
    return () => URL.revokeObjectURL(u);
  }, [firmaEvento]);

  function start(base: Partial<Draft>, personas: PersonaDraft[], horaCitacion: string, salida: string | null) {
    const d: Draft = {
      archivo: null,
      evento: "",
      fecha: "",
      horaCitacion,
      horaEvento: "",
      salida: salida ?? "",
      salidaEditada: false,
      salidaArchivo: null,
      base: String(HORAS_BASE),
      aforo: "",
      personas,
      warnings: [],
      notaLlaves: defaults.nota,
      reclamos: defaults.reclamos,
      aspectosMejorar: "",
      aspectosPermanecer: "",
      sugerencias: defaults.sugerencias,
      notas: defaults.nota ? [defaults.nota] : [],
      localidades: { lc: emptyLoc(), ll: emptyLoc(), bc: emptyLoc(), bl: emptyLoc() },
      observaciones: defaults.observaciones,
      objetosPerdidos: defaults.objetosPerdidos,
      ...base,
    };
    const idx = findBestNameMatch(profile.nombre, personas);
    setDraft(d);
    setMine({ guardar: true, fila: idx >= 0 ? personas[idx].key : "", placeId: teatroId, llegada: "", salida: "", horas: "", valor: "" });
    setErrors({});
    setTimeout(() => formTop.current?.scrollIntoView({ behavior: "smooth", block: "start" }), 50);
  }

  useEffect(() => {
    if (mine && !mine.placeId && teatroId) setMine({ ...mine, placeId: teatroId });
  }, [mine, teatroId]);

  async function onFile(file: File) {
    setParsing(true);
    setManualReason(null);
    const body = new FormData();
    body.append("file", file);
    try {
      const res = await apiFetch("/api/parse", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (res.status === 422) {
        // Formato no reconocido o PDF escaneado: formulario manual completo.
        setManualReason(data.error ?? "No se reconoció el formato.");
        start({ archivo: file }, [nuevaPersona()], "", null);
        return;
      }
      if (!res.ok) throw new Error(data.error ?? "No se pudo leer el archivo.");
      const r = data as Registro<StaffRow>;
      const prep = prepararPersonal(r.staff, r.horaCitacion, extras);
      const personas: PersonaDraft[] = prep.rows.map((s) => ({
        key: Math.random().toString(36).slice(2),
        nombre: s.nombre,
        cargo: s.cargo,
        horas: s.auto ? "" : String(s.horas),
        pp: s.pp,
        desempeno: s.desempeno,
        observacion: s.observacion,
        ubi: s.ubi,
        cc: s.cc,
        delArchivo: true,
        auto: s.auto,
      }));
      start(
        {
          archivo: file,
          evento: r.evento,
          fecha: r.fecha ?? "",
          horaEvento: r.horaEvento ?? "",
          warnings: r.warnings,
          base: String(prep.base),
          salidaArchivo: salidaSugerida(r.staff, null, prep.base),
        },
        personas,
        r.horaCitacion ?? "",
        prep.salida,
      );
    } catch (err) {
      toast.error("No se pudo leer el archivo", (err as Error).message);
    } finally {
      setParsing(false);
    }
  }

  function reset() {
    setDraft(null);
    setMine(null);
    setManualReason(null);
    setFirmaEvento(null);
  }

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setDraft((d) => (d ? { ...d, [k]: v } : d));
  const setM = (patch: Partial<MyHours>) => setMine((m) => (m ? { ...m, ...patch } : m));

  // Horas base: las filas en automático siguen A = base, AC = base + 1, C = base + 2.
  const baseNum = draft ? parseDuracion(draft.base) ?? 0 : HORAS_BASE;
  const baseValida = baseNum > 0 && baseNum <= 16;
  const base = baseValida ? baseNum : HORAS_BASE;
  const personasCalc = useMemo(
    () => (draft?.personas ?? []).map((p) => ({ nombre: p.nombre, horas: horasDe(p, base, extras) })),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [draft?.personas, base, extras.ac, extras.c],
  );
  // La salida sugerida (escrita en el archivo, o citación + base) se usa mientras el coordinador no la cambie.
  const sugerida = draft ? (draft.salidaArchivo ?? (draft.horaCitacion ? fromMin(toMin(draft.horaCitacion) + base * 60) : null)) : null;
  const salida = draft ? (draft.salidaEditada ? draft.salida : sugerida ?? draft.salida) : "";
  const calc = useMemo(
    () => calcularRegistro(personasCalc, { salida: salida || null, horaCitacion: draft?.horaCitacion || null, valorHora: defaults.valorHora }),
    [personasCalc, salida, draft?.horaCitacion, defaults.valorHora],
  );
  const filaIdx = draft && mine ? draft.personas.findIndex((p) => p.key === mine.fila) : -1;

  function validate(d: Draft): Record<string, string> {
    const e: Record<string, string> = {};
    if (!d.evento.trim()) e.evento = "Escribe el nombre del evento.";
    if (!isIsoDate(d.fecha)) e.fecha = "Elige la fecha.";
    if (!/^\d{2}:\d{2}$/.test(d.horaCitacion)) e.horaCitacion = "Falta la hora de citación.";
    if (!/^\d{2}:\d{2}$/.test(d.horaEvento)) e.horaEvento = "Falta la hora del evento.";
    if (!/^\d{2}:\d{2}$/.test(salida)) e.salida = "Falta la hora de salida.";
    if (!baseValida) e.salida = "Las horas base deben estar entre 1 y 16.";
    if (d.aforo !== "" && !/^\d+$/.test(d.aforo)) e.aforo = "El aforo debe ser un número.";
    if (d.personas.some((p) => !p.nombre.trim())) e.personas = "Hay filas sin nombre: complétalas o quítalas.";
    if (mine?.guardar && !mine.placeId) e.mine = "Elige el lugar de trabajo.";
    return e;
  }

  async function submit(ev: FormEvent) {
    ev.preventDefault();
    if (!draft || !mine) return;
    const e = validate(draft);
    setErrors(e);
    if (Object.keys(e).length) return toast.error("Revisa el formulario", Object.values(e)[0]);

    const localidades: GenerateInput["localidades"] = {};
    for (const { key } of LOCS) {
      const l = draft.localidades[key];
      if (l.boletas || l.valor || l.observacion.trim()) localidades[key] = { boletas: toInt(l.boletas), valor: toInt(l.valor), observacion: l.observacion.trim() };
    }
    const payload: GenerateInput = {
      evento: draft.evento.trim(),
      fecha: draft.fecha,
      horaCitacion: draft.horaCitacion,
      horaEvento: draft.horaEvento,
      salida,
      aforo: draft.aforo === "" ? null : Number(draft.aforo),
      notaLlaves: draft.notaLlaves.trim(),
      evaluacion: {
        reclamos: draft.reclamos.trim(),
        aspectosMejorar: draft.aspectosMejorar.trim(),
        aspectosPermanecer: draft.aspectosPermanecer.trim(),
        sugerencias: draft.sugerencias.trim(),
        notas: draft.notas.map((n) => n.trim()).filter(Boolean),
      },
      localidades,
      observaciones: draft.observaciones.trim(),
      objetosPerdidos: draft.objetosPerdidos.trim(),
      personal: draft.personas.map((p) => ({
        nombre: p.nombre.trim(),
        cargo: p.cargo,
        horas: horasDe(p, base, extras),
        pp: p.pp.trim(),
        desempeno: p.desempeno.trim(),
        observacion: p.observacion.trim(),
        ubi: p.ubi,
        cc: p.cc,
      })),
      workLog: mine.guardar
        ? filaIdx >= 0
          ? { placeId: mine.placeId, fila: filaIdx, llegada: null, salida: null, horas: null, valor: null }
          : {
              placeId: mine.placeId,
              fila: null,
              llegada: mine.llegada || null,
              salida: mine.salida || null,
              horas: mine.horas === "" ? diffHoras(mine.llegada || null, mine.salida || null) : parseDuracion(mine.horas),
              valor: toInt(mine.valor),
            }
        : null,
    };

    const body = new FormData();
    body.append("payload", JSON.stringify(payload));
    if (draft.archivo) body.append("registro", draft.archivo);
    if (firmaEvento) body.append("firma", firmaEvento, "firma.png");

    setGenerating(true);
    try {
      const res = await apiFetch("/api/generate", { method: "POST", body });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error ?? "Error al generar.");
      guardarRegistro(data.eventId, {
        name: data.registro.name,
        blob: base64ToBlob(data.registro.base64, "application/vnd.openxmlformats-officedocument.wordprocessingml.document"),
        alertas: data.alertas ?? [],
        sinFirma: !!data.sinFirma,
      });
      toast.success("Planillas generadas", mine.guardar ? "Tus horas quedaron guardadas en Mis horas." : undefined);
      router.push(`/planillas/${data.eventId}`);
    } catch (err) {
      toast.error("No se pudieron generar", (err as Error).message);
      setGenerating(false);
    }
  }

  if (!draft || !mine) {
    return (
      <>
        <PageHeader title="Nueva planilla" description="Sube el registro de personal y genera REGISTRO, LLAVES, COLILLAS y EVALUACIÓN." />
        <Dropzone onFile={onFile} onError={(m) => toast.error(m)} busy={parsing} busyLabel="Leyendo el registro…" />
        <div className="mt-4 flex flex-col items-center gap-1 text-center text-[13px] text-muted">
          <p>El archivo se procesa en memoria y no se guarda. Cédulas y teléfonos nunca se almacenan.</p>
          <button className="font-medium text-fg hover:underline" onClick={() => start({}, [nuevaPersona()], "", null)}>
            Llenar los datos a mano
          </button>
        </div>
      </>
    );
  }

  const autoDelArchivo = draft.personas.filter((p) => p.auto && p.delArchivo).length;
  const supuestas = mensajeSupuestas(autoDelArchivo, base, extras);
  const alertas = [...(supuestas ? [supuestas] : []), ...calc.alertas];

  return (
    <form onSubmit={submit} noValidate>
      <div ref={formTop} className="scroll-mt-20" />
      <PageHeader
        title="Confirma los datos"
        description={
          draft.archivo ? (
            <span className="inline-flex items-center gap-1.5">
              <IconFile width={14} height={14} /> {draft.archivo.name}
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
        <Notice>
          <p className="font-medium">No pudimos leer este archivo automáticamente.</p>
          <p className="mt-0.5 text-muted">{manualReason} Completa los datos a mano; el resultado es el mismo.</p>
        </Notice>
      )}
      {!manualReason && draft.warnings.length > 0 && (
        <Notice>
          {draft.warnings.map((w) => (
            <p key={w}>{w} Complétalo abajo.</p>
          ))}
        </Notice>
      )}

      <div className="space-y-5">
        <Card>
          <StepHeader n={1} title="Evento" description="Datos que salen en el encabezado de las planillas." />
          <div className="grid gap-4 p-4 sm:grid-cols-2 sm:p-5 lg:grid-cols-4">
            <Field label="Nombre del evento" error={errors.evento} className="sm:col-span-2 lg:col-span-4">
              {(id) => <Input id={id} value={draft.evento} onChange={(e) => set("evento", e.target.value)} placeholder="RED DE ESCUELAS" />}
            </Field>
            <Field label="Fecha" error={errors.fecha}>
              {(id) => <Input id={id} type="date" value={draft.fecha} onChange={(e) => set("fecha", e.target.value)} />}
            </Field>
            <Field label="Hora de citación" error={errors.horaCitacion}>
              {(id) => <Input id={id} type="time" value={draft.horaCitacion} onChange={(e) => set("horaCitacion", e.target.value)} />}
            </Field>
            <Field label="Hora del evento" error={errors.horaEvento}>
              {(id) => <Input id={id} type="time" value={draft.horaEvento} onChange={(e) => set("horaEvento", e.target.value)} />}
            </Field>
            <Field label="Aforo" hint="Opcional" error={errors.aforo}>
              {(id) => <Input id={id} inputMode="numeric" value={draft.aforo} onChange={(e) => set("aforo", e.target.value.replace(/\D/g, ""))} placeholder="500" />}
            </Field>
          </div>
        </Card>

        <Card>
          <StepHeader
            n={2}
            title="Registro de personal"
            description={`A = base · AC = base + ${extras.ac} · C = base + ${extras.c}. Valor por hora ${formatCOP(defaults.valorHora)}.`}
            action={
              <div className="flex items-start gap-3">
                <Field className="w-24" label="Horas base" hint={baseValida ? `AC +${extras.ac} · C +${extras.c}` : undefined} error={baseValida ? null : "Entre 1 y 16"}>
                  {(id) => (
                    <Input
                      id={id}
                      inputMode="decimal"
                      className="tabular"
                      value={draft.base}
                      onChange={(e) => set("base", e.target.value.replace(/[^\d.,:hm ]/gi, ""))}
                      placeholder="4"
                    />
                  )}
                </Field>
                <Field className="w-36" label="Salida (todos)" error={errors.salida}>
                  {(id) => (
                    <Input
                      id={id}
                      type="time"
                      value={salida}
                      onChange={(e) => setDraft((d) => (d ? { ...d, salida: e.target.value, salidaEditada: true } : d))}
                    />
                  )}
                </Field>
              </div>
            }
          />
          <div className="p-4 pt-2 sm:p-5 sm:pt-2">
            {draft.salidaEditada && sugerida && sugerida !== salida && (
              <p className="mb-2 text-xs text-muted">
                Sugerida: {hora12(sugerida)} ({draft.salidaArchivo ? "la del registro" : `citación + ${base} h base`}).{" "}
                <button type="button" className="font-medium text-fg underline underline-offset-2" onClick={() => setDraft((d) => (d ? { ...d, salidaEditada: false } : d))}>
                  Usar la sugerida
                </button>
              </p>
            )}
            {alertas.length > 0 && (
              <div className="mb-3 space-y-1 rounded-md border border-warn/25 bg-warn/5 px-3 py-2 text-[13px]">
                {alertas.map((a) => (
                  <p key={a} className="flex gap-2">
                    <IconAlert className="mt-0.5 shrink-0 text-warn" width={14} height={14} />
                    {a}
                  </p>
                ))}
              </div>
            )}
            <RegistroTable
              rows={draft.personas}
              filas={calc.filas}
              totals={{ horas: calc.totalHoras, valor: calc.totalValor }}
              onChange={(rows) => set("personas", rows)}
              highlight={mine.fila}
              base={base}
              extras={extras}
              ubicaciones={defaults.ubicaciones}
            />
            {errors.personas && <p className="mt-2 text-xs text-danger">{errors.personas}</p>}
          </div>
        </Card>

        <Card>
          <StepHeader n={3} title="Planillas" description="Valores por defecto de Ajustes; cámbialos solo para este evento." />
          <div className="divide-y divide-border">
            <Section title="Llaves">
              <Field label="Nota" hint="Va en la línea NOTA: de LLAVES. Incluye cualquier observación sobre las llaves.">
                {(id) => <Textarea id={id} rows={2} value={draft.notaLlaves} onChange={(e) => set("notaLlaves", e.target.value)} />}
              </Field>
            </Section>

            <Section title="Evaluación del evento">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Reclamos y sugerencias del público">
                  {(id) => <Textarea id={id} rows={2} value={draft.reclamos} onChange={(e) => set("reclamos", e.target.value)} />}
                </Field>
                <Field label="Sugerencias del coordinador">
                  {(id) => <Textarea id={id} rows={2} value={draft.sugerencias} onChange={(e) => set("sugerencias", e.target.value)} />}
                </Field>
                <Field label="Aspectos a mejorar en próximos eventos" hint="Vacío = línea para llenar a mano.">
                  {(id) => <Textarea id={id} rows={2} value={draft.aspectosMejorar} onChange={(e) => set("aspectosMejorar", e.target.value)} />}
                </Field>
                <Field label="Aspectos que deben permanecer" hint="Vacío = línea para llenar a mano.">
                  {(id) => <Textarea id={id} rows={2} value={draft.aspectosPermanecer} onChange={(e) => set("aspectosPermanecer", e.target.value)} />}
                </Field>
              </div>
              <div className="mt-4 space-y-2">
                <p className="text-[13px] font-medium">Notas</p>
                {draft.notas.map((n, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <span className="text-faint">•</span>
                    <Input value={n} onChange={(e) => set("notas", draft.notas.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Nota ${i + 1}`} />
                    <button
                      type="button"
                      onClick={() => set("notas", draft.notas.filter((_, j) => j !== i))}
                      className="grid h-8 w-8 shrink-0 place-items-center rounded text-faint hover:bg-subtle hover:text-danger"
                      aria-label={`Quitar nota ${i + 1}`}
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </div>
                ))}
                <Button type="button" size="sm" variant="ghost" icon={<IconPlus />} onClick={() => set("notas", [...draft.notas, ""])}>
                  Agregar nota
                </Button>
              </div>
            </Section>

            <Section title="Colillas">
              {!showLocs ? (
                <Button type="button" size="sm" variant="ghost" icon={<IconPlus />} onClick={() => setShowLocs(true)}>
                  Agregar boletas y valor por localidad (opcional)
                </Button>
              ) : (
                <div className="-mx-4 overflow-x-auto sm:mx-0">
                  <table className="w-full min-w-[560px] text-[13px]">
                    <thead>
                      <tr className="text-left text-[11px] uppercase tracking-wide text-faint">
                        <th className="py-1.5 pl-4 font-medium sm:pl-0">Localidad</th>
                        <th className="w-28 py-1.5 font-medium">Boletas</th>
                        <th className="w-32 py-1.5 font-medium">Valor</th>
                        <th className="w-32 py-1.5 text-right font-medium">Total</th>
                        <th className="py-1.5 pl-3 font-medium">Observaciones</th>
                      </tr>
                    </thead>
                    <tbody>
                      {LOCS.map(({ key, label }) => {
                        const l = draft.localidades[key];
                        const b = toInt(l.boletas);
                        const v = toInt(l.valor);
                        const setL = (patch: Partial<typeof l>) => set("localidades", { ...draft.localidades, [key]: { ...l, ...patch } });
                        return (
                          <tr key={key} className="border-t border-border/70">
                            <td className="py-1.5 pl-4 sm:pl-0">{label}</td>
                            <td className="py-1.5 pr-2">
                              <Input inputMode="numeric" className="h-8 tabular" value={l.boletas} onChange={(e) => setL({ boletas: e.target.value.replace(/\D/g, "") })} aria-label={`Boletas ${label}`} />
                            </td>
                            <td className="py-1.5 pr-2">
                              <Input inputMode="numeric" className="h-8 tabular" value={l.valor} onChange={(e) => setL({ valor: e.target.value.replace(/\D/g, "") })} placeholder="$" aria-label={`Valor ${label}`} />
                            </td>
                            <td className="tabular py-1.5 text-right">{b != null && v != null ? formatCOP(b * v) : "—"}</td>
                            <td className="py-1.5 pl-3">
                              <Input className="h-8" value={l.observacion} maxLength={120} onChange={(e) => setL({ observacion: e.target.value })} aria-label={`Observaciones ${label}`} />
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}
            </Section>

            <Section title="WhatsApp">
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="Observaciones">{(id) => <Textarea id={id} rows={2} value={draft.observaciones} onChange={(e) => set("observaciones", e.target.value)} />}</Field>
                <Field label="Objetos perdidos">{(id) => <Textarea id={id} rows={2} value={draft.objetosPerdidos} onChange={(e) => set("objetosPerdidos", e.target.value)} />}</Field>
              </div>
            </Section>
          </div>
        </Card>

        <Card>
          <StepHeader n={4} title="Firma" description="La de tu perfil o una solo para este evento." />
          <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-center sm:p-5">
            <div className="grid h-20 w-44 shrink-0 place-items-center rounded-md border border-border bg-white">
              {firmaEventoUrl || profile.firma ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={firmaEventoUrl ?? `data:image/png;base64,${profile.firma}`} alt="Firma para este evento" className="max-h-16 max-w-[160px] object-contain" />
              ) : (
                <span className="text-[12px] text-zinc-400">Sin firma</span>
              )}
            </div>
            <div className="flex-1 text-[13px]">
              {firmaEventoUrl ? (
                <p>Se usará esta firma solo en este evento.</p>
              ) : profile.firma ? (
                <p className="text-muted">Se usará la firma de tu perfil.</p>
              ) : (
                <p className="text-warn">
                  No tienes firma: las planillas saldrán con el espacio en blanco.{" "}
                  <Link href="/ajustes" className="font-medium underline underline-offset-2">
                    Agrégala en Ajustes
                  </Link>
                  .
                </p>
              )}
              <div className="mt-2 flex flex-wrap gap-2">
                <Button type="button" size="sm" icon={<IconPencil />} onClick={() => setFirmando(true)}>
                  Firmar este evento
                </Button>
                {firmaEvento && (
                  <Button type="button" size="sm" variant="ghost" onClick={() => setFirmaEvento(null)}>
                    Usar la de mi perfil
                  </Button>
                )}
              </div>
            </div>
          </div>
        </Card>

        <Card>
          <StepHeader
            n={5}
            title="Mis horas"
            description={
              filaIdx >= 0 ? (
                <>
                  Tu fila: <span className="font-medium text-fg">{draft.personas[filaIdx].nombre}</span>
                </>
              ) : draft.personas.length ? (
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
              {draft.personas.length > 0 && (
                <Field label="Tu fila en el registro">
                  {(id) => (
                    <Select id={id} value={mine.fila} onChange={(e) => setM({ fila: e.target.value })}>
                      <option value="">— Ninguna (escribir a mano) —</option>
                      {draft.personas.map((p, i) => (
                        <option key={p.key} value={p.key}>
                          {i + 1}. {p.nombre || "(sin nombre)"} {p.cargo ? `· ${p.cargo}` : ""}
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
              {filaIdx >= 0 ? (
                <p className="tabular text-[13px] text-muted sm:col-span-2">
                  {calc.filas[filaIdx]?.llegada ? `${hora12(calc.filas[filaIdx].llegada, true)} – ${hora12(calc.filas[filaIdx].salida, true)} · ` : ""}
                  {formatDuracion(calc.filas[filaIdx]?.horas)} · {formatCOP(calc.filas[filaIdx]?.valor)} (se toma de tu fila)
                </p>
              ) : (
                <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
                  <Field label="Llegada">{(id) => <Input id={id} type="time" value={mine.llegada} onChange={(e) => setM({ llegada: e.target.value })} />}</Field>
                  <Field label="Salida">{(id) => <Input id={id} type="time" value={mine.salida} onChange={(e) => setM({ salida: e.target.value })} />}</Field>
                  <Field label="Horas">{(id) => <Input id={id} inputMode="decimal" value={mine.horas} placeholder={String(diffHoras(mine.llegada || null, mine.salida || null) ?? "")} onChange={(e) => setM({ horas: e.target.value })} />}</Field>
                  <Field label="Valor">{(id) => <Input id={id} inputMode="numeric" value={mine.valor} onChange={(e) => setM({ valor: e.target.value.replace(/\D/g, "") })} />}</Field>
                </div>
              )}
            </div>
          )}
        </Card>
      </div>

      <div className="sticky bottom-[calc(64px+env(safe-area-inset-bottom))] z-20 -mx-4 mt-6 border-t border-border bg-bg/90 px-4 py-3 backdrop-blur sm:mx-0 sm:rounded-lg sm:border md:bottom-4">
        <div className="flex items-center justify-between gap-3">
          <div className="hidden min-w-0 flex-wrap gap-1 text-[13px] text-muted sm:flex">
            <Badge>REGISTRO</Badge> <Badge>LLAVES</Badge> <Badge>COLILLAS</Badge> <Badge>EVALUACIÓN</Badge>
          </div>
          <Button type="submit" variant="primary" loading={generating} className="w-full sm:w-auto">
            {generating ? "Generando…" : "Generar planillas"}
          </Button>
        </div>
      </div>

      <Modal open={firmando} onClose={() => setFirmando(false)} title="Firmar este evento">
        {firmando && (
          <FirmaEditor
            saveLabel="Usar en este evento"
            onCancel={() => setFirmando(false)}
            onSave={(png) => {
              setFirmaEvento(png);
              setFirmando(false);
            }}
          />
        )}
      </Modal>
    </form>
  );
}

function Notice({ children }: { children: ReactNode }) {
  return (
    <div className="mb-5 flex gap-3 rounded-lg border border-warn/25 bg-warn/5 px-4 py-3 text-[13px]">
      <IconAlert className="mt-0.5 shrink-0 text-warn" />
      <div>{children}</div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className={cx("px-4 py-4 sm:px-5")}>
      <p className="mb-3 text-[11px] font-medium uppercase tracking-wide text-faint">{title}</p>
      {children}
    </div>
  );
}

/** Encabezado de paso: número en rojo, título destacado y descripción. */
function StepHeader({ n, title, description, action }: { n: number; title: string; description?: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col gap-3 border-b border-border px-4 py-4 sm:flex-row sm:items-start sm:justify-between sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        <span className="tabular grid h-8 w-8 shrink-0 place-items-center rounded-md bg-brand text-sm font-bold text-brand-fg">{n}</span>
        <div className="min-w-0 pt-0.5">
          <h2 className="text-base font-bold leading-tight">{title}</h2>
          {description && <p className="mt-1 text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 pl-11 sm:pl-0">{action}</div>}
    </div>
  );
}
