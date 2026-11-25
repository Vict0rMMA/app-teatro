"use client";

import { useCallback, useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { useSession } from "@/components/auth-provider";
import { saveBlob } from "@/components/hooks";
import { DocxPreview } from "@/components/docx-preview";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Modal, Notice, Spinner, Textarea, cx } from "@/components/ui";
import { borrarBorrador, guardarBorrador, leerBorrador } from "@/lib/borrador";
import { esLaPersona } from "@/lib/consolidado-texto";
import { validar, type Extraccion, type Fila, type Validacion } from "@/lib/cuenta-cobro";
import { apiFetch } from "@/lib/firebase/client";
import { comparar, type Comparacion, type RegistroPersonal } from "@/lib/registros";

type Imagen = { base64: string; mediaType: "image/jpeg"; preview: string };
type Firma = { base64: string; tipo: "png" | "jpeg"; anchoPx: number; altoPx: number };
type Respuesta = { datos: Extraccion; validacion: Validacion; comparacion: Comparacion[] };

const MAX_LADO = 2200;
const MESES = ["enero", "febrero", "marzo", "abril", "mayo", "junio", "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre"];

async function comprimir(file: File): Promise<Imagen> {
  const bmp = await createImageBitmap(file);
  const k = Math.min(1, MAX_LADO / Math.max(bmp.width, bmp.height));
  const c = Object.assign(document.createElement("canvas"), { width: Math.round(bmp.width * k), height: Math.round(bmp.height * k) });
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  const url = c.toDataURL("image/jpeg", 0.9);
  return { base64: url.split(",")[1], mediaType: "image/jpeg", preview: url };
}

async function leerFirma(file: File): Promise<Firma> {
  const tipo = file.type === "image/png" ? "png" : "jpeg";
  const bmp = await createImageBitmap(file);
  const buf = new Uint8Array(await file.arrayBuffer());
  let bin = "";
  buf.forEach((b) => (bin += String.fromCharCode(b)));
  return { base64: btoa(bin), tipo, anchoPx: bmp.width, altoPx: bmp.height };
}

/** Firma del perfil (PNG base64) con sus medidas, para el .docx. */
function firmaDePerfil(base64: string): Promise<Firma> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ base64, tipo: "png", anchoPx: img.naturalWidth, altoPx: img.naturalHeight });
    img.onerror = reject;
    img.src = `data:image/png;base64,${base64}`;
  });
}

const pesos = (n: number) => `$${n.toLocaleString("es-CO")}`;
const ESTADO: Record<Comparacion["estado"], { tone: "ok" | "warn" | "neutral" | "danger"; label: string }> = {
  coincide: { tone: "ok", label: "Coincide" },
  diferente: { tone: "warn", label: "Diferente" },
  solo_consolidado: { tone: "neutral", label: "Solo consolidado" },
  solo_registro: { tone: "warn", label: "Solo mi registro" },
};

/**
 * Cuenta de cobro. Se arma SOLO con el consolidado; `registros` (Mis horas) solo se compara.
 */
export default function CuentaCobro({ registros, pdfDisponible }: { registros: RegistroPersonal[] | null; pdfDisponible: boolean }) {
  const { profile, user } = useSession();
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [imagen, setImagen] = useState<Imagen | null>(null);
  const [preparandoImagen, setPreparandoImagen] = useState(false);
  const [persona, setPersona] = useState(profile.nombre);
  const [cargando, setCargando] = useState<"" | "revisar" | "generar">("");
  const [error, setError] = useState("");
  const [res, setRes] = useState<Respuesta | null>(null);
  const [formato, setFormato] = useState<File | null>(null);
  const [errorFormato, setErrorFormato] = useState("");
  const [datos, setDatos] = useState({ celular: "", direccion: "", ciudad: "Medellín - Antioquia" });
  const [usarFirmaPerfil, setUsarFirmaPerfil] = useState(!!profile.firma);
  const [firmaArchivo, setFirmaArchivo] = useState<Firma | null>(null);
  // Reenvío: el consecutivo lo arma el servidor (el del formato con A al final).
  const [reenvio, setReenvio] = useState({ activo: false });
  const [editando, setEditando] = useState(false);
  const [vista, setVista] = useState<Blob | null>(null);

  // Dirección y ciudad se recuerdan en este equipo (el celular no: no se guardan teléfonos).
  const claveDatos = `cuenta-datos:${user.uid}`;
  useEffect(() => {
    try {
      const g = JSON.parse(localStorage.getItem(claveDatos) ?? "null") as { direccion?: string; ciudad?: string } | null;
      if (g) setDatos((d) => ({ ...d, direccion: g.direccion ?? d.direccion, ciudad: g.ciudad ?? d.ciudad }));
    } catch {
      /* sin almacenamiento */
    }
  }, [claveDatos]);
  useEffect(() => {
    try {
      if (datos.direccion.trim() || datos.ciudad.trim()) localStorage.setItem(claveDatos, JSON.stringify({ direccion: datos.direccion, ciudad: datos.ciudad }));
    } catch {
      /* sin almacenamiento */
    }
  }, [claveDatos, datos.direccion, datos.ciudad]);

  // Borrador: lo que se está haciendo sobrevive a recargar (solo en este equipo, 12 h; sin el celular).
  const claveBorrador = `cuenta-cobro:${user.uid}`;
  const [restaurado, setRestaurado] = useState(false);
  type Borrador = { texto: string; imagen: Imagen | null; persona: string; res: Respuesta | null; formato: File | null; reenvio: boolean; usarFirmaPerfil: boolean };
  useEffect(() => {
    let vivo = true;
    leerBorrador<Borrador>(claveBorrador).then((b) => {
      if (!vivo) return;
      if (b && (b.texto || b.imagen || b.res)) {
        setTexto(b.texto);
        setImagen(b.imagen);
        setPersona(b.persona);
        setRes(b.res);
        setFormato(b.formato);
        setReenvio({ activo: b.reenvio });
        setUsarFirmaPerfil(b.usarFirmaPerfil);
        toast.info("Seguimos donde ibas", "Recuperamos la cuenta de cobro que estabas armando.");
      }
      setRestaurado(true);
    });
    return () => {
      vivo = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [claveBorrador]);
  useEffect(() => {
    if (!restaurado) return;
    const t = window.setTimeout(() => {
      if (texto || imagen || res) void guardarBorrador<Borrador>(claveBorrador, { texto, imagen, persona, res, formato, reenvio: reenvio.activo, usarFirmaPerfil });
      else void borrarBorrador(claveBorrador);
    }, 400);
    return () => window.clearTimeout(t);
  }, [restaurado, claveBorrador, texto, imagen, persona, res, formato, reenvio.activo, usarFirmaPerfil]);

  function empezarDeNuevo() {
    setTexto("");
    setImagen(null);
    setRes(null);
    setFormato(null);
    setReenvio({ activo: false });
    setEditando(false);
    setError("");
  }

  const onPaste = async (e: ClipboardEvent) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      setPreparandoImagen(true);
      try {
        setImagen(await comprimir(item.getAsFile()!));
        setError("");
      } catch {
        setError("No se pudo abrir esa imagen. Prueba con otra foto o pega las filas del Excel.");
      } finally {
        setPreparandoImagen(false);
      }
    }
  };

  function seleccionarFormato(archivo: File | null, input: HTMLInputElement) {
    if (archivo && (!archivo.name.toLowerCase().endsWith(".docx") || archivo.size > 2_000_000)) {
      setFormato(null);
      setErrorFormato("Elige un archivo .docx de hasta 2 MB.");
      input.value = "";
      return;
    }
    setFormato(archivo);
    setErrorFormato("");
    input.value = "";
  }

  function cambiarFila(indice: number, campo: keyof Fila, valor: string) {
    setRes((actual) => {
      if (!actual) return actual;
      const filas = actual.datos.filas.map((fila, i) => {
        if (i !== indice) return fila;
        const numero = ["horas", "valor_hora", "total"].includes(campo);
        const actualizada = { ...fila, [campo]: numero ? (valor === "" ? 0 : Number(valor)) : valor } as Fila;
        if (campo === "horas" || campo === "valor_hora") actualizada.total = actualizada.horas * actualizada.valor_hora;
        return actualizada;
      });
      const datos = { ...actual.datos, filas };
      return { ...actual, datos, validacion: validar(datos) };
    });
  }

  function cambiarPersona(campo: "nombre" | "cedula", valor: string) {
    setRes((actual) => {
      if (!actual) return actual;
      const datos = { ...actual.datos, persona: { ...actual.datos.persona, [campo]: valor } };
      return { ...actual, datos, validacion: validar(datos) };
    });
  }

  function cambiarPeriodo(campo: "mes" | "anio", valor: string) {
    setRes((actual) => {
      if (!actual) return actual;
      const datos = { ...actual.datos, [campo]: valor === "" ? 0 : Number(valor) };
      return { ...actual, datos, validacion: validar(datos) };
    });
  }

  function campoFila(fila: Fila, indice: number, campo: keyof Fila, etiqueta: string) {
    const valor = fila[campo];
    if (editando) {
      return (
        <label className="block min-w-0">
          <span className="sr-only">{etiqueta}</span>
          <input
            aria-label={etiqueta}
            className="h-10 w-full min-w-0 rounded-ctl border border-border bg-surface px-2 text-[16px] text-fg focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20 md:h-8 md:text-[13px]"
            type={typeof valor === "number" ? "number" : "text"}
            inputMode={typeof valor === "number" ? "decimal" : undefined}
            min={typeof valor === "number" ? 0 : undefined}
            step={typeof valor === "number" ? "any" : undefined}
            value={typeof valor === "number" && !Number.isFinite(valor) ? "" : String(valor ?? "")}
            onChange={(e) => cambiarFila(indice, campo, e.target.value)}
          />
        </label>
      );
    }
    if (campo === "total" || campo === "valor_hora") return pesos(Number(valor));
    return String(valor ?? "");
  }

  async function procesar() {
    setCargando("revisar");
    setError("");
    setRes(null);
    try {
      const r = await apiFetch("/api/cuenta-cobro", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          texto: texto || undefined,
          imagen: imagen ? { base64: imagen.base64, mediaType: imagen.mediaType } : undefined,
          persona: persona.trim() || undefined,
          registros: registros ?? [],
        }),
      });
      const j = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(j.error ?? `Error ${r.status}`);
      setRes(j as Respuesta);
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando("");
    }
  }

  /** Pide el archivo al servidor (valida de nuevo todo allá). */
  const pedirArchivo = useCallback(
    async (salida: "docx" | "pdf"): Promise<Blob> => {
      if (!res) throw new Error("Primero revisa el consolidado.");
      const { nombre, cedula } = res.datos.persona;
      const firma = usarFirmaPerfil && profile.firma ? await firmaDePerfil(profile.firma) : firmaArchivo ?? undefined;
      let plantilla: { base64: string } | undefined;
      if (formato) {
        const bytes = new Uint8Array(await formato.arrayBuffer());
        let binario = "";
        for (let i = 0; i < bytes.length; i += 32_768) binario += String.fromCharCode(...bytes.subarray(i, i + 32_768));
        plantilla = { base64: btoa(binario) };
      }
      const r = await apiFetch(`/api/cuenta-cobro/generar${salida === "pdf" ? "?format=pdf" : ""}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datos: res.datos,
          plantilla,
          persona: {
            nombre,
            cedula,
            ...datos,
            firma,
            reenvio: reenvio.activo ? { consecutivo: "" } : undefined,
          },
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error([j.error, ...(j.errores ?? [])].filter(Boolean).join(" ") || `Error ${r.status}`);
      }
      return r.blob();
    },
    [res, usarFirmaPerfil, profile.firma, firmaArchivo, formato, datos, reenvio.activo],
  );

  async function verAntes() {
    setCargando("generar");
    setError("");
    try {
      setVista(await pedirArchivo("docx"));
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando("");
    }
  }

  async function descargar(salida: "docx" | "pdf") {
    if (!res) return;
    setCargando("generar");
    setError("");
    try {
      const { nombre } = res.datos.persona;
      const blob = salida === "docx" && vista ? vista : await pedirArchivo(salida);
      const extension = salida === "pdf" ? "pdf" : "docx";
      saveBlob(blob, `Cuenta de cobro_${nombre}.${extension}`);
      setVista(null);
      toast.success("Cuenta de cobro descargada", salida === "pdf" ? "Se convirtió el DOCX seleccionado." : "El Word conserva el formato y las declaraciones.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando("");
    }
  }

  const v = res?.validacion;
  const listo = !!v?.ok && !!datos.celular.trim() && !!datos.direccion.trim() && !!datos.ciudad.trim();
  // ¿El consolidado es de la persona del perfil? (evita armar la cuenta de otra persona por error)
  const otraPersona = !!res && !!res.datos.persona.nombre && !esLaPersona(profile.nombre, res.datos.persona.nombre, "");
  const comp = useMemo(
    () => (res ? comparar(res.datos.filas, registros ?? [], res.datos.mes, res.datos.anio) : []),
    [res, registros],
  );
  const resumenComp = useMemo(() => {
    const n = (e: Comparacion["estado"]) => comp.filter((c) => c.estado === e).length;
    return { coincide: n("coincide"), diferente: n("diferente"), soloC: n("solo_consolidado"), soloR: n("solo_registro"), excedidos: comp.filter((c) => c.excedido_8h_en_registro).length };
  }, [comp]);
  const registroDeMas = comp.some((c) => c.horas_registro > c.horas_consolidado);

  return (
    <div>
      {/* 1 · Consolidado */}
      <section className="pb-10">
        <h2 className="font-bold tracking-tight text-[22px]">Consolidado</h2>
        <p className="mt-1 max-w-prose text-[13px] text-muted">
          Pega las filas del Excel o una captura (Ctrl+V), o sube una foto. La cuenta se arma solo con esto.
        </p>
        <div className="mt-5 grid gap-4 md:grid-cols-2" onPaste={onPaste}>
          <Textarea
            className="min-h-[200px] font-mono text-xs leading-relaxed"
            placeholder="Pega aquí las filas del Excel…"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            aria-label="Texto del consolidado"
          />
          <label
            className={cx(
              "flex min-h-[200px] cursor-pointer flex-col justify-between rounded-box border-[1.5px] border-dashed p-5 transition-colors duration-100",
              imagen ? "border-border bg-surface" : "border-border bg-surface hover:border-fg/30",
            )}
          >
            {imagen ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={imagen.preview} alt="Captura del consolidado" className="max-h-56 w-full object-contain" />
            ) : (
              <p className="font-bold tracking-tight text-xl leading-snug">Pega una captura o elige una foto del Excel</p>
            )}
            <span className="mt-4 flex items-center justify-between text-[12px] uppercase tracking-[0.06em] text-muted">
              <span>.png · .jpg · .webp</span>
              {imagen && (
                <button
                  type="button"
                  className="normal-case tracking-normal text-brand underline underline-offset-2"
                  onClick={(e) => {
                    e.preventDefault();
                    setImagen(null);
                  }}
                >
                  Quitar
                </button>
              )}
            </span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              hidden
              onChange={async (e) => {
                const input = e.currentTarget;
                const archivo = e.target.files?.[0];
                if (!archivo) return;
                setPreparandoImagen(true);
                try {
                  setImagen(await comprimir(archivo));
                  setError("");
                } catch {
                  setError("No se pudo abrir esa imagen. Prueba con otra foto o pega las filas del Excel.");
                } finally {
                  setPreparandoImagen(false);
                  input.value = "";
                }
              }}
            />
          </label>
        </div>
        <label className="mt-4 flex min-h-[76px] cursor-pointer items-center justify-between gap-4 rounded-box border-[1.5px] border-dashed border-border bg-surface px-5 py-4 transition-colors duration-100 hover:border-fg/30">
          <span className="min-w-0">
            <span className="block font-semibold">Poner formato de cuenta de cobro</span>
            <span className="mt-1 block truncate text-[12px] text-muted">
              {formato ? `Formato seleccionado: ${formato.name}` : "Sube el DOCX que te entregaron · hasta 2 MB. Si no eliges uno, se usa el formato oficial incluido."}
            </span>
            {errorFormato && <span className="mt-1 block text-[12px] text-danger">{errorFormato}</span>}
          </span>
          <span className="shrink-0 rounded-ctl border border-border px-3 py-2 text-[12px] font-medium">Elegir formato</span>
          <input
            type="file"
            accept=".docx,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
            className="sr-only"
            onChange={(e) => seleccionarFormato(e.target.files?.[0] ?? null, e.currentTarget)}
          />
        </label>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <Field label="Persona" hint="Si el Excel trae varias personas, solo se toman tus filas." className="flex-1">
            {(id) => <Input id={id} value={persona} onChange={(e) => setPersona(e.target.value)} placeholder="Nombre o cédula" />}
          </Field>
          <Button variant="primary" size="lg" loading={cargando === "revisar"} disabled={!!cargando || preparandoImagen || (!texto.trim() && !imagen)} onClick={procesar} className="sm:mb-[22px]">
            {cargando === "revisar" ? "Leyendo…" : "Revisar consolidado"}
          </Button>
        </div>
        {preparandoImagen && <p className="mt-3 text-[13px] text-muted">Preparando la foto…</p>}
        {cargando === "revisar" && <p className="mt-3 flex items-center gap-2 text-[13px] text-muted"><Spinner className="h-3.5 w-3.5" /> Puede tardar hasta un minuto.</p>}
        {error && !res && (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        )}
      </section>

      {res && v && (
        <>
          {/* 2 · Revisión */}
          <section className="border-t border-border pb-10 pt-8">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h2 className="font-bold tracking-tight text-[22px]">Revisión</h2>
              <div className="flex gap-2">
                <Button size="sm" aria-pressed={editando} onClick={() => setEditando(!editando)}>
                  {editando ? "Terminar edición" : "Editar datos leídos"}
                </Button>
                <Button size="sm" variant="ghost" onClick={empezarDeNuevo}>
                  Empezar de nuevo
                </Button>
              </div>
            </div>
            {otraPersona && (
              <Notice className="mt-4">
                El consolidado es de <span className="font-medium">{res.datos.persona.nombre}</span> y tu perfil es de{" "}
                <span className="font-medium">{profile.nombre}</span>. Confirma que sea tu cuenta antes de generarla.
              </Notice>
            )}
            {editando && (
              <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <Field label="Nombre de la persona">{(id) => <Input id={id} value={res.datos.persona.nombre} onChange={(e) => cambiarPersona("nombre", e.target.value)} />}</Field>
                <Field label="Cédula">{(id) => <Input id={id} inputMode="numeric" value={res.datos.persona.cedula} onChange={(e) => cambiarPersona("cedula", e.target.value)} />}</Field>
                <Field label="Mes de la cuenta">{(id) => <Input id={id} type="number" min={1} max={12} value={res.datos.mes} onChange={(e) => cambiarPeriodo("mes", e.target.value)} />}</Field>
                <Field label="Año">{(id) => <Input id={id} type="number" min={2000} max={2100} value={res.datos.anio} onChange={(e) => cambiarPeriodo("anio", e.target.value)} />}</Field>
              </div>
            )}
            <dl className="mt-5 grid grid-cols-2 gap-y-5 border-y border-border py-5 lg:grid-cols-4 lg:divide-x lg:divide-border">
              {(
                [
                  ["Persona", res.datos.persona.nombre],
                  ["Eventos", String(res.datos.filas.length)],
                  ["Horas", `${v.totalHoras} h`],
                  ["Total", pesos(v.totalValor)],
                ] as const
              ).map(([k, val], i) => (
                <div key={k} className={cx("min-w-0", i > 0 && "lg:pl-6")}>
                  <dt className="eyebrow">{k}</dt>
                  <dd className={cx("tabular mt-1 truncate", i === 0 ? "pt-1 text-sm font-medium" : "font-bold tracking-tight text-[26px] leading-tight")}>{val}</dd>
                </div>
              ))}
            </dl>

            <div className="mt-5 space-y-3">
              {v.errores.length > 0 && (
                <Notice tone="danger">
                  <p className="font-medium">Hay que corregir el consolidado antes de generar:</p>
                  <ul className="mt-1 space-y-0.5">
                    {v.errores.map((e) => (
                      <li key={e}>{e}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {v.alertas.length > 0 && (
                <Notice>
                  <p className="font-medium">Confirma con la coordinadora antes de enviar:</p>
                  <ul className="mt-1 space-y-0.5">
                    {v.alertas.map((a) => (
                      <li key={a}>{a}</li>
                    ))}
                  </ul>
                </Notice>
              )}
              {v.ok && v.alertas.length === 0 && (
                <Notice tone="ok">Horas, máximo 8 h por día, cruces, fechas y totales verificados.</Notice>
              )}
            </div>

            <div className="mt-5 hidden overflow-x-auto rounded-box border border-border bg-surface md:block">
              <table className="w-full min-w-[1260px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Evento", "Fecha", "Dependencia", "C. costos", "Cuenta", "Proyecto", "Valor hora", "Inicio", "Fin"].map((h) => (
                      <th key={h} className="th px-3 font-medium">
                        {h}
                      </th>
                    ))}
                    <th className="th px-3 text-right font-medium">Horas</th>
                    <th className="th px-3 text-right font-medium">Total</th>
                  </tr>
                </thead>
                <tbody>
                  {v.grupos.map((g) => [
                    ...g.filas.map((f) => {
                      const indice = res.datos.filas.indexOf(f);
                      return (
                      <tr key={`${g.centro}-${indice}`} className="border-b border-border/60 transition-colors duration-100 hover:bg-subtle/40">
                        <td className="max-w-[220px] px-2 py-2">{campoFila(f, indice, "evento", "Evento")}</td>
                        <td className="tabular px-2 py-2">{campoFila(f, indice, "fecha", "Fecha")}</td>
                        <td className="max-w-[180px] px-2 py-2 text-muted">{campoFila(f, indice, "dependencia", "Dependencia")}</td>
                        <td className="tabular px-2 py-2 font-mono text-[12px]">{campoFila(f, indice, "centro_costos", "Centro de costos")}</td>
                        <td className="tabular px-2 py-2 font-mono text-[12px]">{campoFila(f, indice, "cuenta", "Cuenta")}</td>
                        <td className="tabular px-2 py-2 font-mono text-[12px]">{campoFila(f, indice, "proyecto", "Proyecto")}</td>
                        <td className="tabular px-2 py-2">{campoFila(f, indice, "valor_hora", "Valor por hora")}</td>
                        <td className="tabular px-2 py-2">{campoFila(f, indice, "hora_inicio", "Hora de inicio")}</td>
                        <td className="tabular px-2 py-2">{campoFila(f, indice, "hora_fin", "Hora de fin")}</td>
                        <td className="tabular px-2 py-2 text-right">{campoFila(f, indice, "horas", "Horas")}</td>
                        <td className="tabular px-2 py-2 text-right">{campoFila(f, indice, "total", "Total")}</td>
                      </tr>
                      );
                    }),
                    <tr key={g.centro + "s"} className="border-b border-border bg-subtle/60">
                      <td className="eyebrow px-3 py-2 text-fg" colSpan={9}>
                        Subtotal {g.nombre}
                      </td>
                      <td className="tabular px-3 py-2 text-right font-medium">{g.horas}</td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-right font-medium">{pesos(g.valor)}</td>
                    </tr>,
                  ])}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="px-3 py-3 text-muted" colSpan={9}>
                      Total · {v.grupos.length} centros de costos
                    </td>
                    <td className="tabular px-3 py-3 text-right font-bold tracking-tight text-[17px]">{v.totalHoras}</td>
                    <td className="tabular whitespace-nowrap px-3 py-3 text-right font-bold tracking-tight text-[17px]">{pesos(v.totalValor)}</td>
                  </tr>
                </tfoot>
              </table>
            </div>

            <div className="mt-5 space-y-3 md:hidden">
              {res.datos.filas.map((f, indice) => (
                <Card key={`evento-${indice}`} className="space-y-4 p-4">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="eyebrow">Evento {indice + 1}</p>
                      <div className="mt-1 font-semibold">{campoFila(f, indice, "evento", `Evento ${indice + 1}`)}</div>
                    </div>
                    <div className="shrink-0 text-right">
                      <p className="eyebrow">Total</p>
                      <p className="tabular mt-1 font-bold">{campoFila(f, indice, "total", `Total evento ${indice + 1}`)}</p>
                    </div>
                  </div>
                  <div className="grid grid-cols-2 gap-3">
                    {([
                      ["fecha", "Fecha"], ["dependencia", "Dependencia"], ["centro_costos", "Centro de costos"], ["cuenta", "Cuenta"],
                      ["proyecto", "Proyecto"], ["valor_hora", "Valor hora"], ["hora_inicio", "Inicio"], ["hora_fin", "Fin"], ["horas", "Horas"],
                    ] as const).map(([campo, titulo]) => (
                      <div key={campo} className="min-w-0">
                        <span className="block text-[11px] font-medium uppercase tracking-wide text-muted">{titulo}</span>
                        <span className="mt-1 block break-words">{campoFila(f, indice, campo, `${titulo}, evento ${indice + 1}`)}</span>
                      </div>
                    ))}
                  </div>
                </Card>
              ))}
            </div>
          </section>

          {/* 3 · Comparación con Mis horas */}
          <section className="border-t border-border pb-10 pt-8">
            <h2 className="font-bold tracking-tight text-[22px]">Consolidado vs. Mis horas</h2>
            <p className="mt-1 max-w-prose text-[13px] text-muted">
              Solo para que compares. La cuenta siempre lleva lo del consolidado; tus registros no cambian ninguna fila, hora ni valor.
            </p>
            {registros === null ? (
              <p className="mt-4 text-[13px] text-muted">Cargando tus registros…</p>
            ) : comp.every((c) => c.estado === "solo_consolidado") ? (
              <p className="mt-4 text-[13px] text-muted">No tienes horas en Mis horas para {MESES[res.datos.mes - 1]} de {res.datos.anio}. Nada que comparar.</p>
            ) : (
              <>
                <p className="mt-4 flex flex-wrap gap-x-5 gap-y-1">
                  <Badge tone="ok">{resumenComp.coincide} coinciden</Badge>
                  {resumenComp.diferente > 0 && <Badge tone="warn">{resumenComp.diferente} con diferencia</Badge>}
                  {resumenComp.soloR > 0 && <Badge tone="warn">{resumenComp.soloR} solo en mi registro</Badge>}
                  {resumenComp.soloC > 0 && <Badge>{resumenComp.soloC} solo en el consolidado</Badge>}
                  {resumenComp.excedidos > 0 && <Badge tone="danger">{resumenComp.excedidos} días con más de 8 h en mi registro</Badge>}
                </p>
                {registroDeMas && (
                  <Notice className="mt-4">
                    Hay días donde tu registro tiene más horas que el consolidado. En la cuenta va lo del consolidado; tu registro queda como respaldo para reclamar.
                  </Notice>
                )}
                <div className="mt-4 overflow-x-auto">
                  <table className="w-full min-w-[640px] text-[13px]">
                    <thead>
                      <tr className="border-b border-border text-left">
                        <th className="th w-28 font-medium">Fecha</th>
                        <th className="th w-28 text-right font-medium">Consolidado</th>
                        <th className="th w-28 text-right font-medium">Mi registro</th>
                        <th className="th w-40 pl-6 font-medium">Estado</th>
                        <th className="th font-medium">Detalle</th>
                      </tr>
                    </thead>
                    <tbody>
                      {comp
                        .filter((c) => c.estado !== "coincide")
                        .map((c) => (
                          <tr key={c.fecha} className="border-b border-border/60 align-top">
                            <td className="tabular py-2">{c.fecha}</td>
                            <td className="tabular py-2 text-right">{c.horas_consolidado} h</td>
                            <td className={cx("tabular py-2 text-right", c.excedido_8h_en_registro && "font-medium text-danger")}>{c.horas_registro} h</td>
                            <td className="py-2 pl-6">
                              <Badge tone={c.excedido_8h_en_registro ? "danger" : ESTADO[c.estado].tone}>{ESTADO[c.estado].label}</Badge>
                            </td>
                            <td className="py-2 text-muted">{c.mensaje}</td>
                          </tr>
                        ))}
                    </tbody>
                  </table>
                  {resumenComp.coincide > 0 && <p className="mt-2 text-[12px] text-muted">Los {resumenComp.coincide} días que coinciden no se listan.</p>}
                </div>
              </>
            )}
          </section>

          {/* 4 · Datos y Word */}
          <section className="border-t border-border pb-6 pt-8">
            <h2 className="font-bold tracking-tight text-[22px]">Tus datos y el formato oficial</h2>
            <p className="mt-1 max-w-prose text-[13px] text-muted">Se usan solo para llenar el documento; no se guardan.</p>
            <div className="mt-5 grid gap-4 md:grid-cols-3">
              <Field label="Celular">{(id) => <Input id={id} inputMode="tel" autoComplete="tel" value={datos.celular} onChange={(e) => setDatos({ ...datos, celular: e.target.value })} />}</Field>
              <Field label="Dirección">{(id) => <Input id={id} autoComplete="street-address" value={datos.direccion} onChange={(e) => setDatos({ ...datos, direccion: e.target.value })} />}</Field>
              <Field label="Ciudad">{(id) => <Input id={id} value={datos.ciudad} onChange={(e) => setDatos({ ...datos, ciudad: e.target.value })} />}</Field>
            </div>

            <div className="mt-6 space-y-3 text-[13px]">
              <p className="eyebrow text-fg">Firma</p>
              {profile.firma && (
                <label className="flex items-center gap-2">
                  <input type="checkbox" checked={usarFirmaPerfil} onChange={(e) => setUsarFirmaPerfil(e.target.checked)} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                  Usar la firma de mi perfil
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`data:image/png;base64,${profile.firma}`} alt="" className="ml-2 h-8 rounded-ctl border border-border bg-white px-1" />
                </label>
              )}
              {(!profile.firma || !usarFirmaPerfil) && (
                <label className="block">
                  <span className="text-muted">Firma digital o escaneada (PNG o JPG, no foto). Opcional.</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg"
                    className="mt-1 block text-[13px] file:mr-3 file:h-9 file:rounded-ctl file:border file:border-border file:bg-transparent file:px-3 file:text-fg"
                    onChange={async (e) => e.target.files?.[0] && setFirmaArchivo(await leerFirma(e.target.files[0]))}
                  />
                </label>
              )}
            </div>

            <div className="mt-6 text-[13px]">
              <label className="flex items-center gap-2">
                <input type="checkbox" checked={reenvio.activo} onChange={(e) => setReenvio({ ...reenvio, activo: e.target.checked })} className="h-4 w-4 accent-[rgb(var(--brand))]" />
                Es un reenvío por corrección
              </label>
              {reenvio.activo && (
                <p className="mt-2 pl-6 text-[12px] text-muted">Se usa el consecutivo del formato con una A al final (ej. 2026-10 → 2026-10A). La fecha del formato no cambia.</p>
              )}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button size="lg" loading={cargando === "generar" && !vista} disabled={!listo || !!cargando} onClick={verAntes}>
                Ver antes de descargar
              </Button>
              {pdfDisponible ? (
                <>
                  <Button variant="primary" size="lg" loading={cargando === "generar"} disabled={!listo || !!cargando} onClick={() => descargar("pdf")}>
                    Descargar PDF
                  </Button>
                  <Button size="lg" disabled={!listo || !!cargando} onClick={() => descargar("docx")}>
                    Descargar Word
                  </Button>
                </>
              ) : (
                <Button variant="primary" size="lg" loading={cargando === "generar"} disabled={!listo || !!cargando} onClick={() => descargar("docx")}>
                  Descargar Word para PDF
                </Button>
              )}
              {!v.ok ? (
                <p className="text-[13px] text-danger">Corrige los errores del consolidado primero.</p>
              ) : !listo ? (
                <p className="text-[13px] text-muted">Completa celular, dirección y ciudad.</p>
              ) : null}
            </div>
            {error && !vista && (
              <Notice tone="danger" className="mt-4">
                {error}
              </Notice>
            )}
            {!pdfDisponible && (
              <Notice className="mt-4">
                Para descargar PDF desde el app, falta configurar el conversor Gotenberg en el servidor. Mientras tanto, Word conserva el formato al exportar a PDF.
              </Notice>
            )}

          </section>

          <Modal
            open={!!vista}
            onClose={() => setVista(null)}
            title="Así queda tu cuenta de cobro"
            wide
            footer={
              <>
                <Button onClick={() => setVista(null)}>Cerrar</Button>
                {pdfDisponible && (
                  <Button loading={cargando === "generar"} disabled={!!cargando} onClick={() => descargar("pdf")}>
                    Descargar PDF
                  </Button>
                )}
                <Button variant="primary" disabled={!!cargando} onClick={() => descargar("docx")}>
                  Descargar Word
                </Button>
              </>
            }
          >
            {error && (
              <Notice tone="danger" className="mb-3">
                {error}
              </Notice>
            )}
            {vista && <VistaCuenta blob={vista} />}
          </Modal>

          <section className="mt-4 rounded-box bg-subtle/70 px-5 py-4 text-[13px] leading-relaxed">
            <p className="eyebrow text-fg">Para enviar</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                {pdfDisponible ? <>Descarga el PDF con el formato seleccionado: <span className="font-medium">{v.correo.archivo}</span>.</> : <>Abre el DOCX en Word y elige Archivo → Guardar como → PDF: <span className="font-medium">{v.correo.archivo}</span>.</>}
              </li>
              <li>
                Correo nuevo a <span className="font-medium">{v.correo.para}</span>, asunto <span className="font-medium">{v.correo.asunto}</span>.
              </li>
              <li>Adjunta primero la cuenta y luego el RUT actualizado. Envía una sola vez y antes del día 25.</li>
            </ol>
          </section>
        </>
      )}
    </div>
  );
}

/** Vista previa del Word generado (el mismo archivo que se descarga). */
function VistaCuenta({ blob }: { blob: Blob }) {
  const load = useCallback(async () => blob, [blob]);
  return <DocxPreview load={load} />;
}
