"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { useSession } from "@/components/auth-provider";
import { Dropzone } from "@/components/dropzone";
import { FirmaEditor } from "@/components/firma/firma-editor";
import { usePlaces } from "@/components/hooks";
import { IconPencil, IconPlus, IconTrash, IconUsers, IconX } from "@/components/icons";
import { horasDe, nuevaPersona, RegistroTable, type PersonaDraft } from "@/components/registro-table";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Modal, Notice, PageHeader, Select, Textarea, cx } from "@/components/ui";
import { apiFetch } from "@/lib/firebase/client";
import { diffHoras, fechaWhatsapp, findBestNameMatch, formatCOP, formatMiles, hora12, isIsoDate, parseDuracion, formatDuracion } from "@/lib/format";
import { calcularRegistro, fromMin, HORAS_BASE, mensajeSupuestas, prepararPersonal, salidaSugerida, toMin } from "@/lib/registro/calculo";
import type { Registro, StaffRow } from "@/lib/registro/types";
import { guardarRegistro, base64ToBlob } from "@/lib/registro-memoria";
import { borrarBorrador, guardarBorrador, leerBorrador } from "@/lib/borrador";
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
  const [mostrarAvisoSeguidor, setMostrarAvisoSeguidor] = useState(true);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [generating, setGenerating] = useState(false);
  const formTop = useRef<HTMLDivElement>(null);

  // ---- Borrador: lo que se está llenando sobrevive a recargar o cerrar la pestaña ----
  const claveBorrador = `nueva-planilla:${user.uid}`;
  const [restaurado, setRestaurado] = useState(false);
  useEffect(() => {
    let vivo = true;
    leerBorrador<{ draft: Draft; mine: MyHours; manualReason: string | null; firmaEvento: Blob | null; showLocs: boolean }>(claveBorrador).then((b) => {
      if (!vivo) return;
      if (b?.draft) {
        setDraft(b.draft);
        setMine(b.mine);
        setManualReason(b.manualReason);
        setFirmaEvento(b.firmaEvento);
        setShowLocs(b.showLocs);
        toast.info("Seguimos donde ibas", "Recuperamos la planilla que estabas llenando.");
      }
      setRestaurado(true);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveBorrador]);
  useEffect(() => {
    if (!restaurado) return; // no pisar el borrador antes de leerlo
    const t = window.setTimeout(() => {
      if (draft && mine) void guardarBorrador(claveBorrador, { draft, mine, manualReason, firmaEvento, showLocs });
      else void borrarBorrador(claveBorrador);
    }, 400);
    return () => window.clearTimeout(t);
  }, [restaurado, claveBorrador, draft, mine, manualReason, firmaEvento, showLocs]);
  // Paso visible en pantalla, para el stepper.
  const [paso, setPaso] = useState<string>("paso-archivo");
  const hayDraft = !!draft;
  useEffect(() => {
    if (!hayDraft) return;
    const io = new IntersectionObserver(
      (entries) => {
        const vis = entries.filter((e) => e.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top);
        if (vis[0]) setPaso(vis[0].target.id);
      },
      { rootMargin: "-30% 0px -60% 0px" },
    );
    document.querySelectorAll("section[id^='paso-']").forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [hayDraft]);

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
    setMostrarAvisoSeguidor(true);
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
    setMostrarAvisoSeguidor(true);
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
      await borrarBorrador(claveBorrador);
      toast.success("Planillas generadas", mine.guardar ? "Tus horas quedaron guardadas en Mis horas." : undefined);
      router.push(`/planillas/${data.eventId}`);
    } catch (err) {
      toast.error("No se pudieron generar", (err as Error).message);
      setGenerating(false);
    }
  }

  if (!restaurado) return null;

  if (!draft || !mine) {
    return (
      <>
        <PageHeader eyebrow="Nueva planilla" title="Sube el registro del evento" description={hoyLargo()} />
        <Dropzone onFile={onFile} onError={(m) => toast.error(m)} busy={parsing} busyLabel="Leyendo el registro…" />
        <div className="mt-5 flex flex-col gap-3 text-[13px] text-muted sm:flex-row sm:items-center sm:justify-between">
          <p className="max-w-md">Se lee en memoria y no se guarda. Cédulas y teléfonos nunca quedan en la app.</p>
          <Button variant="secondary" onClick={() => start({}, [nuevaPersona()], "", null)}>
            Llenar los datos a mano
          </Button>
        </div>
        <p className="mt-10 border-t border-border pt-5 text-[13px] text-muted">
          Después revisas el evento, el personal y el cierre, y descargas REGISTRO, LLAVES, COLILLAS y EVALUACIÓN.
        </p>
      </>
    );
  }

  const autoDelArchivo = draft.personas.filter((p) => p.auto && p.delArchivo).length;
  const supuestas = mensajeSupuestas(autoDelArchivo, base, extras);
  const alertas = [...(supuestas ? [supuestas] : []), ...calc.alertas];
  const nAvisos = alertas.length + (manualReason ? 1 : draft.warnings.length) + Object.keys(errors).length;
  const hechos = [
    true,
    !!draft.evento.trim() && isIsoDate(draft.fecha) && /^\d{2}:\d{2}$/.test(draft.horaCitacion) && /^\d{2}:\d{2}$/.test(draft.horaEvento),
    draft.personas.length > 0 && draft.personas.every((p) => p.nombre.trim()) && /^\d{2}:\d{2}$/.test(salida) && baseValida,
    !!(firmaEvento || profile.firma),
  ];

  const resumen = (
    <dl className="space-y-4">
      <div>
        <dt className="eyebrow">Personal</dt>
        <dd className="tabular mt-0.5 text-sm">
          {draft.personas.length} {draft.personas.length === 1 ? "persona" : "personas"}
        </dd>
      </div>
      <div>
        <dt className="eyebrow">Horas</dt>
        <dd className="tabular mt-0.5 font-bold tracking-tight text-2xl">{formatDuracion(calc.totalHoras)}</dd>
      </div>
      <div>
        <dt className="eyebrow">Total a pagar</dt>
        <dd className="tabular mt-0.5 font-bold tracking-tight text-2xl">{formatCOP(calc.totalValor)}</dd>
      </div>
      <div>
        <dt className="eyebrow">Advertencias</dt>
        <dd className="mt-1">
          {nAvisos ? <Badge tone="warn">{nAvisos === 1 ? "1 por revisar" : `${nAvisos} por revisar`}</Badge> : <Badge tone="ok">Sin pendientes</Badge>}
        </dd>
      </div>
    </dl>
  );

  return (
    <form onSubmit={submit} noValidate>
      {mostrarAvisoSeguidor && (
        <aside
          className="fixed bottom-24 right-4 z-[60] flex w-[min(420px,calc(100vw-2rem))] items-start gap-3 rounded-box border border-brand/25 bg-surface px-4 py-3 shadow-lg sm:bottom-6 sm:right-6"
          aria-label="Recordatorio sobre seguidores"
          role="status"
          aria-live="polite"
        >
          <span aria-hidden className="mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-brand/10 text-brand">
            <IconUsers width={17} height={17} />
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold">¿Este evento tuvo seguidor?</p>
            <p className="mt-0.5 text-[13px] text-muted">Recuerda poner la 1 hora de más.</p>
          </div>
          <button
            type="button"
            onClick={() => setMostrarAvisoSeguidor(false)}
            className="grid h-8 w-8 shrink-0 place-items-center rounded-ctl text-muted transition-colors hover:bg-subtle hover:text-fg"
            aria-label="Cerrar aviso"
            title="Cerrar aviso"
          >
            <IconX width={16} height={16} />
          </button>
        </aside>
      )}
      <div ref={formTop} className="scroll-mt-28" />
      <PageHeader
        eyebrow="Nueva planilla"
        title={draft.evento.trim() || "Evento sin nombre"}
        description={draft.fecha ? `${fechaWhatsapp(draft.fecha)} de ${draft.fecha.slice(0, 4)}` : "Completa los datos y genera las cuatro planillas."}
        action={
          <Button type="button" variant="ghost" onClick={reset}>
            Empezar de nuevo
          </Button>
        }
      />

      {/* Stepper */}
      <nav aria-label="Pasos" className="sticky top-14 z-20 -mx-4 mb-8 border-b border-border bg-bg/95 px-4 backdrop-blur sm:-mx-8 sm:px-8 md:top-0">
        <ol className="flex gap-6 overflow-x-auto sm:gap-10">
          {PASOS.map((p, i) => (
            <li key={p.id} className="shrink-0">
              <a
                href={`#${p.id}`}
                aria-current={paso === p.id ? "step" : undefined}
                className={cx(
                  "relative flex h-12 items-center gap-2 text-[13px] transition-colors duration-100",
                  paso === p.id ? "text-fg" : "text-muted hover:text-fg",
                )}
              >
                <span className={cx("tabular font-bold tracking-tight text-[15px]", hechos[i] ? "text-ok" : paso === p.id ? "text-brand" : "text-faint")}>{i + 1}</span>
                <span className={paso === p.id ? "font-medium" : undefined}>{p.label}</span>
                {paso === p.id && <span aria-hidden className="absolute inset-x-0 -bottom-px h-0.5 bg-brand" />}
              </a>
            </li>
          ))}
        </ol>
      </nav>

      <div className="grid gap-10 xl:grid-cols-[minmax(0,1fr)_220px]">
        <div className="min-w-0">
          {/* 1 · Archivo */}
          <Paso id="paso-archivo" n={1} title="Archivo">
            <div className="flex flex-wrap items-baseline justify-between gap-3">
              <p className="text-sm">
                {draft.archivo ? (
                  <>
                    <span className="font-medium">{draft.archivo.name}</span>
                    <span className="text-muted"> · leído en memoria</span>
                  </>
                ) : (
                  <span className="text-muted">Entrada manual, sin archivo.</span>
                )}
              </p>
              <button type="button" onClick={reset} className="text-[13px] text-muted underline underline-offset-2 hover:text-fg">
                Cambiar archivo
              </button>
            </div>
            {manualReason && (
              <Notice className="mt-4">
                <p className="font-medium">No se pudo leer el archivo automáticamente.</p>
                <p className="text-muted">{manualReason} Completa los datos a mano; el resultado es el mismo.</p>
              </Notice>
            )}
            {!manualReason && draft.warnings.length > 0 && (
              <Notice className="mt-4">
                {draft.warnings.map((w) => (
                  <p key={w}>{w} Complétalo abajo.</p>
                ))}
              </Notice>
            )}
          </Paso>

          {/* 2 · Evento */}
          <Paso id="paso-evento" n={2} title="Evento" description="Sale en el encabezado de las cuatro planillas.">
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Field label="Nombre del evento" error={errors.evento} className="sm:col-span-2 lg:col-span-4">
                {(id) => <Input id={id} value={draft.evento} onChange={(e) => set("evento", e.target.value)} placeholder="RED DE ESCUELAS" />}
              </Field>
              <Field label="Fecha" error={errors.fecha}>
                {(id) => <Input id={id} type="date" value={draft.fecha} onChange={(e) => set("fecha", e.target.value)} />}
              </Field>
              <Field label="Citación" error={errors.horaCitacion}>
                {(id) => <Input id={id} type="time" value={draft.horaCitacion} onChange={(e) => set("horaCitacion", e.target.value)} />}
              </Field>
              <Field label="Hora del evento" error={errors.horaEvento}>
                {(id) => <Input id={id} type="time" value={draft.horaEvento} onChange={(e) => set("horaEvento", e.target.value)} />}
              </Field>
              <Field label="Aforo" hint="Opcional" error={errors.aforo}>
                {(id) => <Input id={id} inputMode="numeric" value={draft.aforo} onChange={(e) => set("aforo", e.target.value.replace(/\D/g, ""))} placeholder="500" />}
              </Field>
            </div>
          </Paso>

          {/* 3 · Personal */}
          <Paso
            id="paso-personal"
            n={3}
            title="Personal"
            description={`Escribe la llegada o las horas de cada persona; lo demás se calcula. A = base · AC = base + ${extras.ac} · C = base + ${extras.c} · ${formatCOP(defaults.valorHora)} la hora.`}
          >
            <div className="mb-4 flex flex-wrap items-start gap-4">
              <Field className="w-28" label="Horas base" hint={baseValida ? `AC +${extras.ac} · C +${extras.c}` : undefined} error={baseValida ? null : "Entre 1 y 16"}>
                {(id) => (
                  <Input id={id} inputMode="decimal" className="tabular" value={draft.base} onChange={(e) => set("base", e.target.value.replace(/[^\d.,:hm ]/gi, ""))} placeholder="4" />
                )}
              </Field>
              <Field className="w-36" label="Salida de todos" error={errors.salida}>
                {(id) => (
                  <Input id={id} type="time" value={salida} onChange={(e) => setDraft((d) => (d ? { ...d, salida: e.target.value, salidaEditada: true } : d))} />
                )}
              </Field>
              {draft.salidaEditada && sugerida && sugerida !== salida && (
                <p className="max-w-xs pt-6 text-xs text-muted">
                  Sugerida: {hora12(sugerida)} ({draft.salidaArchivo ? "la del registro" : `citación + ${base} h`}).{" "}
                  <button type="button" className="font-medium text-fg underline underline-offset-2" onClick={() => setDraft((d) => (d ? { ...d, salidaEditada: false } : d))}>
                    Usar la sugerida
                  </button>
                </p>
              )}
            </div>
            {alertas.length > 0 && (
              <Notice className="mb-4">
                {alertas.map((a) => (
                  <p key={a}>{a}</p>
                ))}
              </Notice>
            )}
            <Card className="px-0 py-1 sm:px-2">
              <RegistroTable
                rows={draft.personas}
                filas={calc.filas}
                totals={{ horas: calc.totalHoras, valor: calc.totalValor }}
                onChange={(rows) => set("personas", rows)}
                highlight={mine.fila}
                base={base}
                extras={extras}
                ubicaciones={defaults.ubicaciones}
                salida={salida || null}
              />
            </Card>
            {errors.personas && <p className="mt-2 text-xs text-danger">{errors.personas}</p>}
          </Paso>

          {/* 4 · Cierre */}
          <Paso id="paso-cierre" n={4} title="Cierre" description="Llaves, evaluación, colillas, firma y tus horas. Vienen con los valores de Ajustes.">
            <div className="divide-y divide-border">
              <Sub title="Llaves">
                <Field label="Nota" hint="Va en la línea NOTA: de LLAVES.">
                  {(id) => <Textarea id={id} rows={2} value={draft.notaLlaves} onChange={(e) => set("notaLlaves", e.target.value)} />}
                </Field>
              </Sub>

              <Sub title="Evaluación del evento">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Reclamos y sugerencias del público">
                    {(id) => <Textarea id={id} rows={2} value={draft.reclamos} onChange={(e) => set("reclamos", e.target.value)} />}
                  </Field>
                  <Field label="Sugerencias del coordinador">
                    {(id) => <Textarea id={id} rows={2} value={draft.sugerencias} onChange={(e) => set("sugerencias", e.target.value)} />}
                  </Field>
                  <Field label="Aspectos a mejorar" hint="Vacío = línea para llenar a mano.">
                    {(id) => <Textarea id={id} rows={2} value={draft.aspectosMejorar} onChange={(e) => set("aspectosMejorar", e.target.value)} />}
                  </Field>
                  <Field label="Aspectos que deben permanecer" hint="Vacío = línea para llenar a mano.">
                    {(id) => <Textarea id={id} rows={2} value={draft.aspectosPermanecer} onChange={(e) => set("aspectosPermanecer", e.target.value)} />}
                  </Field>
                </div>
                <div className="mt-5 space-y-2">
                  <p className="text-[12px] font-medium uppercase tracking-[0.05em] text-muted">Notas</p>
                  {draft.notas.map((n, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="tabular w-4 text-right text-[13px] text-faint">{i + 1}</span>
                      <Input value={n} onChange={(e) => set("notas", draft.notas.map((x, j) => (j === i ? e.target.value : x)))} aria-label={`Nota ${i + 1}`} />
                      <button
                        type="button"
                        onClick={() => set("notas", draft.notas.filter((_, j) => j !== i))}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-ctl text-faint hover:bg-subtle hover:text-danger"
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
              </Sub>

              <Sub title="Colillas">
                {!showLocs ? (
                  <button type="button" className="text-[13px] text-brand underline decoration-brand/40 underline-offset-4" onClick={() => setShowLocs(true)}>
                    Agregar boletas y valor por localidad (opcional)
                  </button>
                ) : (
                  <div className="-mx-4 overflow-x-auto sm:mx-0">
                    <table className="w-full min-w-[560px] text-[13px]">
                      <thead>
                        <tr className="border-b border-border text-left">
                          <th className="th pl-4 font-medium sm:pl-0">Localidad</th>
                          <th className="th w-28 font-medium">Boletas</th>
                          <th className="th w-32 font-medium">Valor</th>
                          <th className="th w-32 text-right font-medium">Total</th>
                          <th className="th pl-3 font-medium">Observaciones</th>
                        </tr>
                      </thead>
                      <tbody>
                        {LOCS.map(({ key, label }) => {
                          const l = draft.localidades[key];
                          const b = toInt(l.boletas);
                          const v = toInt(l.valor);
                          const setL = (patch: Partial<typeof l>) => set("localidades", { ...draft.localidades, [key]: { ...l, ...patch } });
                          return (
                            <tr key={key} className="border-b border-border/60">
                              <td className="py-1.5 pl-4 sm:pl-0">{label}</td>
                              <td className="py-1.5 pr-2">
                                <Input inputMode="numeric" className="tabular h-8 sm:h-8" value={l.boletas} onChange={(e) => setL({ boletas: e.target.value.replace(/\D/g, "") })} aria-label={`Boletas ${label}`} />
                              </td>
                              <td className="py-1.5 pr-2">
                                <Input inputMode="numeric" className="tabular h-8 sm:h-8" value={l.valor} onChange={(e) => setL({ valor: formatMiles(e.target.value) })} placeholder="$" aria-label={`Valor ${label}`} />
                              </td>
                              <td className="tabular py-1.5 text-right">{b != null && v != null ? formatCOP(b * v) : "—"}</td>
                              <td className="py-1.5 pl-3">
                                <Input className="h-8 sm:h-8" value={l.observacion} maxLength={120} onChange={(e) => setL({ observacion: e.target.value })} aria-label={`Observaciones ${label}`} />
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </Sub>

              <Sub title="WhatsApp">
                <div className="grid gap-4 sm:grid-cols-2">
                  <Field label="Observaciones">{(id) => <Textarea id={id} rows={2} value={draft.observaciones} onChange={(e) => set("observaciones", e.target.value)} />}</Field>
                  <Field label="Objetos perdidos">{(id) => <Textarea id={id} rows={2} value={draft.objetosPerdidos} onChange={(e) => set("objetosPerdidos", e.target.value)} />}</Field>
                </div>
              </Sub>

              <Sub title="Firma">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-center">
                  <div className="grid h-20 w-44 shrink-0 place-items-center rounded-ctl border border-border bg-white">
                    {firmaEventoUrl || profile.firma ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img src={firmaEventoUrl ?? `data:image/png;base64,${profile.firma}`} alt="Firma para este evento" className="max-h-16 max-w-[160px] object-contain" />
                    ) : (
                      <span className="text-[12px] text-stone-500">Sin firma</span>
                    )}
                  </div>
                  <div className="flex-1 text-[13px]">
                    {firmaEventoUrl ? (
                      <p>Esta firma se usa solo en este evento.</p>
                    ) : profile.firma ? (
                      <p className="text-muted">Se usa la firma de tu perfil.</p>
                    ) : (
                      <p className="text-warn">
                        No tienes firma: las planillas salen con el espacio en blanco.{" "}
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
              </Sub>

              <Sub
                title="Mis horas"
                action={
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={mine.guardar} onChange={(e) => setM({ guardar: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                    Guardar en Mis horas
                  </label>
                }
              >
                <p className="mb-4 text-[13px] text-muted">
                  {filaIdx >= 0 ? (
                    <>
                      Tu fila: <span className="font-medium text-fg">{draft.personas[filaIdx].nombre}</span>
                    </>
                  ) : draft.personas.length ? (
                    "No encontramos tu nombre en la tabla. Elige tu fila o escribe tus horas."
                  ) : (
                    "Registra tus horas de este evento."
                  )}
                </p>
                {mine.guardar && (
                  <div className="grid gap-4 sm:grid-cols-2">
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
                        {formatDuracion(calc.filas[filaIdx]?.horas)} · {formatCOP(calc.filas[filaIdx]?.valor)} (sale de tu fila)
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-3 sm:col-span-2 sm:grid-cols-4">
                        <Field label="Llegada">{(id) => <Input id={id} type="time" value={mine.llegada} onChange={(e) => setM({ llegada: e.target.value })} />}</Field>
                        <Field label="Salida">{(id) => <Input id={id} type="time" value={mine.salida} onChange={(e) => setM({ salida: e.target.value })} />}</Field>
                        <Field label="Horas">
                          {(id) => <Input id={id} inputMode="decimal" value={mine.horas} placeholder={String(diffHoras(mine.llegada || null, mine.salida || null) ?? "")} onChange={(e) => setM({ horas: e.target.value })} />}
                        </Field>
                        <Field label="Valor">{(id) => <Input id={id} inputMode="numeric" value={mine.valor} placeholder="10.000" onChange={(e) => setM({ valor: formatMiles(e.target.value) })} />}</Field>
                      </div>
                    )}
                  </div>
                )}
              </Sub>
            </div>
          </Paso>
        </div>

        {/* Resumen (escritorio) */}
        <aside className="hidden xl:block">
          <div className="sticky top-20 space-y-6 border-l border-border pl-6">
            {resumen}
            <div className="border-t border-border pt-5">
              <Button type="submit" variant="primary" size="lg" loading={generating} className="w-full">
                {generating ? "Generando…" : "Generar planillas"}
              </Button>
              <p className="mt-2 text-[12px] leading-relaxed text-muted">REGISTRO · LLAVES · COLILLAS · EVALUACIÓN</p>
            </div>
          </div>
        </aside>
      </div>

      {/* Barra de generar (móvil y pantallas medianas) */}
      <div className="fixed inset-x-0 bottom-[calc(60px+env(safe-area-inset-bottom))] z-20 border-t border-border bg-bg/95 px-4 py-3 backdrop-blur md:bottom-0 md:left-[208px] xl:hidden">
        <div className="mx-auto flex max-w-[1080px] items-center justify-between gap-4 sm:px-4">
          <div className="min-w-0">
            <p className="tabular truncate font-bold tracking-tight text-lg leading-tight">{formatCOP(calc.totalValor)}</p>
            <p className="tabular truncate text-[12px] text-muted">
              {formatDuracion(calc.totalHoras)} · {draft.personas.length} personas{nAvisos ? ` · ${nAvisos} por revisar` : ""}
            </p>
          </div>
          <Button type="submit" variant="primary" size="lg" loading={generating} className="shrink-0">
            {generating ? "Generando…" : "Generar planillas"}
          </Button>
        </div>
      </div>
      <div className="h-24 xl:hidden" aria-hidden />

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

const PASOS = [
  { id: "paso-archivo", label: "Archivo" },
  { id: "paso-evento", label: "Evento" },
  { id: "paso-personal", label: "Personal" },
  { id: "paso-cierre", label: "Cierre" },
] as const;

function hoyLargo() {
  const s = new Intl.DateTimeFormat("es-CO", { weekday: "long", day: "numeric", month: "long" }).format(new Date());
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Paso numerado: número en serif, título y contenido sin caja. */
function Paso({ id, n, title, description, children }: { id: string; n: number; title: string; description?: ReactNode; children: ReactNode }) {
  return (
    <section id={id} className={cx("scroll-mt-32 pb-10", n > 1 && "border-t border-border pt-8")}>
      <div className="mb-5 flex gap-4">
        <span className="tabular w-6 shrink-0 pt-0.5 font-bold tracking-tight text-[22px] leading-none text-brand">{n}</span>
        <div className="min-w-0">
          <h2 className="font-bold tracking-tight text-[22px] leading-none">{title}</h2>
          {description && <p className="mt-2 max-w-prose text-[13px] text-muted">{description}</p>}
        </div>
      </div>
      <div className="sm:pl-10">{children}</div>
    </section>
  );
}

function Sub({ title, action, children }: { title: string; action?: ReactNode; children: ReactNode }) {
  return (
    <div className="py-5 first:pt-0">
      <div className="mb-3 flex items-center justify-between gap-3">
        <p className="eyebrow text-fg">{title}</p>
        {action}
      </div>
      {children}
    </div>
  );
}
