"use client";

import { useEffect, useMemo, useState, type ClipboardEvent } from "react";
import { useSession } from "@/components/auth-provider";
import { saveBlob } from "@/components/hooks";
import { useToast } from "@/components/toast";
import { Badge, Button, Card, Field, Input, Notice, Spinner, Textarea, cx } from "@/components/ui";
import type { Extraccion, Validacion } from "@/lib/cuenta-cobro";
import { apiFetch } from "@/lib/firebase/client";
import type { Comparacion, RegistroPersonal } from "@/lib/registros";

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
const fechaHoy = () => {
  const d = new Date();
  const mes = MESES[d.getMonth()];
  return `${d.getDate()} de ${mes.charAt(0).toUpperCase()}${mes.slice(1)} de ${d.getFullYear()}`;
};

const ESTADO: Record<Comparacion["estado"], { tone: "ok" | "warn" | "neutral" | "danger"; label: string }> = {
  coincide: { tone: "ok", label: "Coincide" },
  diferente: { tone: "warn", label: "Diferente" },
  solo_consolidado: { tone: "neutral", label: "Solo consolidado" },
  solo_registro: { tone: "warn", label: "Solo mi registro" },
};

/**
 * Cuenta de cobro. Se arma SOLO con el consolidado; `registros` (Mis horas) solo se compara.
 */
export default function CuentaCobro({ registros }: { registros: RegistroPersonal[] | null }) {
  const { profile } = useSession();
  const toast = useToast();
  const [texto, setTexto] = useState("");
  const [imagen, setImagen] = useState<Imagen | null>(null);
  const [persona, setPersona] = useState(profile.nombre);
  const [cargando, setCargando] = useState<"" | "revisar" | "word">("");
  const [error, setError] = useState("");
  const [res, setRes] = useState<Respuesta | null>(null);
  const [formato, setFormato] = useState<File | null>(null);
  const [errorFormato, setErrorFormato] = useState("");
  const [datos, setDatos] = useState({ celular: "", direccion: "", ciudad: "Medellín - Antioquia" });
  const [usarFirmaPerfil, setUsarFirmaPerfil] = useState(!!profile.firma);
  const [firmaArchivo, setFirmaArchivo] = useState<Firma | null>(null);
  const [reenvio, setReenvio] = useState({ activo: false, fecha: "", consecutivo: "" });

  useEffect(() => {
    if (!res || reenvio.fecha) return;
    const { mes, anio } = res.datos;
    setReenvio((r) => ({ ...r, fecha: fechaHoy(), consecutivo: `${anio}-${String(mes).padStart(2, "0")}A` }));
  }, [res, reenvio.fecha]);

  const onPaste = async (e: ClipboardEvent) => {
    const item = [...e.clipboardData.items].find((i) => i.type.startsWith("image/"));
    if (item) {
      e.preventDefault();
      setImagen(await comprimir(item.getAsFile()!));
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

  async function descargar() {
    if (!res) return;
    setCargando("word");
    setError("");
    try {
      const { nombre, cedula } = res.datos.persona;
      const firma = usarFirmaPerfil && profile.firma ? await firmaDePerfil(profile.firma) : firmaArchivo ?? undefined;
      let plantilla: { base64: string } | undefined;
      if (formato) {
        const bytes = new Uint8Array(await formato.arrayBuffer());
        let binario = "";
        for (let i = 0; i < bytes.length; i += 32_768) binario += String.fromCharCode(...bytes.subarray(i, i + 32_768));
        plantilla = { base64: btoa(binario) };
      }
      const r = await apiFetch("/api/cuenta-cobro/generar", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          datos: res.datos,
          plantilla,
          persona: {
            nombre,
            cedula,
            ...datos,
            fechaEmision: reenvio.fecha,
            firma,
            reenvio: reenvio.activo ? { fecha: reenvio.fecha, consecutivo: reenvio.consecutivo } : undefined,
          },
        }),
      });
      if (!r.ok) {
        const j = await r.json().catch(() => ({}));
        throw new Error([j.error, ...(j.errores ?? [])].filter(Boolean).join(" ") || `Error ${r.status}`);
      }
      const blob = await r.blob();
      saveBlob(blob, `Cuenta de cobro_${nombre}.docx`);
      toast.success("Cuenta de cobro descargada", "Ábrela en Word y guárdala como PDF para conservar el formato y las declaraciones.");
    } catch (e) {
      setError((e as Error).message);
    } finally {
      setCargando("");
    }
  }

  const v = res?.validacion;
  const listo = !!v?.ok && !!datos.celular.trim() && !!datos.direccion.trim() && !!datos.ciudad.trim() && (!reenvio.activo || (!!reenvio.fecha && !!reenvio.consecutivo));
  const comp = useMemo(() => res?.comparacion ?? [], [res]);
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
            <input type="file" accept="image/*" hidden onChange={async (e) => e.target.files?.[0] && setImagen(await comprimir(e.target.files[0]))} />
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
          <Button variant="primary" size="lg" loading={cargando === "revisar"} disabled={!!cargando || (!texto.trim() && !imagen)} onClick={procesar} className="sm:mb-[22px]">
            {cargando === "revisar" ? "Leyendo…" : "Revisar consolidado"}
          </Button>
        </div>
        {cargando === "revisar" && <p className="mt-3 flex items-center gap-2 text-[13px] text-muted"><Spinner className="h-3.5 w-3.5" /> Puede tardar hasta un minuto.</p>}
        {error && (
          <Notice tone="danger" className="mt-4">
            {error}
          </Notice>
        )}
      </section>

      {res && v && (
        <>
          {/* 2 · Revisión */}
          <section className="border-t border-border pb-10 pt-8">
            <h2 className="font-bold tracking-tight text-[22px]">Revisión</h2>
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

            <Card className="mt-5 overflow-x-auto">
              <table className="w-full min-w-[900px] text-[13px]">
                <thead>
                  <tr className="border-b border-border text-left">
                    {["Evento", "Fecha", "Dependencia", "C. costos", "Cuenta", "Proyecto", "Inicio", "Fin"].map((h) => (
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
                    ...g.filas.map((f, i) => (
                      <tr key={g.centro + i} className="border-b border-border/60 transition-colors duration-100 hover:bg-subtle/40">
                        <td className="max-w-[220px] truncate px-3 py-2" title={f.evento}>{f.evento}</td>
                        <td className="tabular px-3 py-2">{f.fecha}</td>
                        <td className="max-w-[160px] truncate px-3 py-2 text-muted" title={f.dependencia}>{f.dependencia}</td>
                        <td className="tabular whitespace-nowrap px-3 py-2 font-mono text-[12px]">{f.centro_costos}</td>
                        <td className="tabular px-3 py-2 font-mono text-[12px]">{f.cuenta}</td>
                        <td className="tabular px-3 py-2 font-mono text-[12px]">{f.proyecto}</td>
                        <td className="tabular px-3 py-2 font-mono text-[12px]">{f.hora_inicio}</td>
                        <td className="tabular px-3 py-2 font-mono text-[12px]">{f.hora_fin}</td>
                        <td className="tabular px-3 py-2 text-right">{f.horas}</td>
                        <td className="tabular whitespace-nowrap px-3 py-2 text-right">{pesos(f.total)}</td>
                      </tr>
                    )),
                    <tr key={g.centro + "s"} className="border-b border-border bg-subtle/60">
                      <td className="eyebrow px-3 py-2 text-fg" colSpan={8}>
                        Subtotal {g.nombre}
                      </td>
                      <td className="tabular px-3 py-2 text-right font-medium">{g.horas}</td>
                      <td className="tabular whitespace-nowrap px-3 py-2 text-right font-medium">{pesos(g.valor)}</td>
                    </tr>,
                  ])}
                </tbody>
                <tfoot>
                  <tr>
                    <td className="px-3 py-3 text-muted" colSpan={8}>
                      Total · {v.grupos.length} centros de costos
                    </td>
                    <td className="tabular px-3 py-3 text-right font-bold tracking-tight text-[17px]">{v.totalHoras}</td>
                    <td className="tabular whitespace-nowrap px-3 py-3 text-right font-bold tracking-tight text-[17px]">{pesos(v.totalValor)}</td>
                  </tr>
                </tfoot>
              </table>
            </Card>
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
                Es un reenvío por corrección (cambia la fecha y el consecutivo)
              </label>
              {reenvio.activo && (
                <div className="mt-3 grid gap-4 sm:grid-cols-2">
                  <Field label="Fecha de hoy">{(id) => <Input id={id} value={reenvio.fecha} onChange={(e) => setReenvio({ ...reenvio, fecha: e.target.value })} />}</Field>
                  <Field label="Consecutivo" hint="El de la cuenta original con A al final.">
                    {(id) => <Input id={id} value={reenvio.consecutivo} onChange={(e) => setReenvio({ ...reenvio, consecutivo: e.target.value })} />}
                  </Field>
                </div>
              )}
            </div>

            <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
              <Button variant="primary" size="lg" loading={cargando === "word"} disabled={!listo || !!cargando} onClick={descargar}>
                Generar cuenta de cobro
              </Button>
              {!v.ok ? (
                <p className="text-[13px] text-danger">Corrige los errores del consolidado primero.</p>
              ) : !listo ? (
                <p className="text-[13px] text-muted">Completa celular, dirección y ciudad.</p>
              ) : null}
            </div>

          </section>

          <section className="mt-4 rounded-box bg-subtle/70 px-5 py-4 text-[13px] leading-relaxed">
            <p className="eyebrow text-fg">Para enviar</p>
            <ol className="mt-2 list-decimal space-y-1 pl-5">
              <li>
                Abre el DOCX descargado en Word y elige Archivo → Guardar como → PDF. Así se conservan las páginas, la tabla y las declaraciones del formato seleccionado. Usa el nombre <span className="font-medium">{v.correo.archivo}</span>.
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
