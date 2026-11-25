"use client";

import { useEffect, useState } from "react";
import { formatCOP, hora12, duracionCampo, formatDuracion, parseDuracion, diffHoras } from "@/lib/format";
import { horasPorCargo, type Extras, type FilaCalculada } from "@/lib/registro/calculo";
import { IconPlus, IconTrash } from "./icons";
import { Button, Input, Select, cx } from "./ui";

export interface PersonaDraft {
  key: string;
  nombre: string;
  cargo: "C" | "AC" | "A" | "";
  horas: string;
  pp: string;
  desempeno: string;
  observacion: string;
  ubi: string;
  cc: string;
  /** viene del archivo: nombre, cargo y UBI no se editan */
  delArchivo: boolean;
  /** sin horas propias: sigue la regla (A = base, AC = base + 1, C = base + 2) */
  auto: boolean;
}

export const nuevaPersona = (): PersonaDraft => ({
  key: Math.random().toString(36).slice(2),
  nombre: "",
  cargo: "A",
  horas: "",
  pp: "5",
  desempeno: "5",
  observacion: "",
  ubi: "",
  cc: "",
  delArchivo: false,
  auto: true,
});

/** Horas efectivas: las escritas a mano o, en modo automático, las de la regla por cargo. */
export function horasDe(p: PersonaDraft, base: number, extras: Extras): number | null {
  if (p.auto) return horasPorCargo(p.cargo, base, extras);
  return parseDuracion(p.horas);
}

const cell = "h-8 rounded-ctl border-transparent bg-transparent px-2 text-[13px] hover:border-border focus:border-fg/30 focus:bg-surface";

/**
 * Tabla editable del registro. Horas, P.P, DESEMP y observación se editan; llegada,
 * salida y valor se recalculan en vivo. Nombre y cargo de las filas del archivo no se tocan.
 */
export function RegistroTable({
  rows,
  filas,
  totals,
  onChange,
  highlight,
  base,
  extras,
  ubicaciones,
  salida,
}: {
  rows: PersonaDraft[];
  filas: FilaCalculada[];
  totals: { horas: number; valor: number };
  onChange: (rows: PersonaDraft[]) => void;
  highlight?: string | null;
  base: number;
  extras: Extras;
  ubicaciones: Record<string, string>;
  /** salida común: la llegada que escribas se resta de aquí para sacar las horas */
  salida: string | null;
}) {
  // Escribir horas a mano saca la fila del modo automático; la regla ya no se le vuelve a aplicar.
  const update = (key: string, patch: Partial<PersonaDraft>) =>
    onChange(rows.map((r) => (r.key === key ? { ...r, ...patch, auto: "horas" in patch ? false : r.auto } : r)));

  return (
    <div>
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[980px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-[0.06em] text-muted">
              <th className="w-8 py-2 pl-4 font-medium sm:pl-2">N°</th>
              <th className="py-2 font-medium">Nombre</th>
              <th className="w-16 py-2 font-medium">Cargo</th>
              <th className="w-14 py-2 font-medium">UBI</th>
              <th className="w-24 py-2 font-medium">Horas</th>
              <th className="w-28 py-2 font-medium">Llegada</th>
              <th className="w-[84px] py-2 font-medium">Salida</th>
              <th className="w-24 py-2 text-right font-medium">Valor</th>
              <th className="w-14 py-2 pl-3 font-medium">P.P</th>
              <th className="w-16 py-2 font-medium">Desemp.</th>
              <th className="w-44 py-2 font-medium">Observación</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const f = filas[i];
              const h = horasDe(r, base, extras);
              const sinHoras = h == null || h <= 0;
              const ubiNombre = ubicaciones[r.ubi.trim().toUpperCase()];
              return (
                <tr key={r.key} className={cx("border-b border-border/60 transition-colors duration-100 hover:bg-subtle/40", highlight === r.key && "bg-brand-soft/40 hover:bg-brand-soft/50")}>
                  <td className="tabular py-1 pl-4 text-faint sm:pl-2">{i + 1}</td>
                  <td className="py-1 pr-1">
                    {r.delArchivo ? (
                      <span className="block truncate px-2">{r.nombre}</span>
                    ) : (
                      <Input className={cell} value={r.nombre} placeholder="Nombre completo" onChange={(e) => update(r.key, { nombre: e.target.value })} aria-label={`Nombre fila ${i + 1}`} />
                    )}
                  </td>
                  <td className="py-1 pr-1">
                    {r.delArchivo ? (
                      <span className="px-2 text-muted">{r.cargo || "—"}</span>
                    ) : (
                      <Select className={cell} value={r.cargo} onChange={(e) => update(r.key, { cargo: e.target.value as PersonaDraft["cargo"] })} aria-label="Cargo">
                        <option value="C">C</option>
                        <option value="AC">AC</option>
                        <option value="A">A</option>
                      </Select>
                    )}
                  </td>
                  <td className="py-1 pr-1">
                    {r.delArchivo ? (
                      <span className={cx("px-2", ubiNombre ? "cursor-help underline decoration-dotted underline-offset-2" : "text-muted")} title={ubiNombre ?? undefined}>
                        {r.ubi || "—"}
                      </span>
                    ) : (
                      <Input className={cell} value={r.ubi} maxLength={10} title={ubiNombre} onChange={(e) => update(r.key, { ubi: e.target.value.toUpperCase() })} aria-label="UBI" />
                    )}
                  </td>
                  <td className="relative py-1 pr-1">
                    <Input
                      inputMode="decimal"
                      className={cx(cell, "tabular", sinHoras && "border-warn/60 bg-warn/5", r.auto && "pr-9 text-muted")}
                      value={r.auto ? duracionCampo(h) : r.horas}
                      placeholder="5:30"
                      onChange={(e) => update(r.key, { horas: e.target.value.replace(/[^\d.,:hm ]/gi, "") })}
                      aria-label={`Horas de ${r.nombre || `la fila ${i + 1}`}`}
                      title={r.auto ? "Automático según cargo y horas base. Escribe para fijarlas a mano (ej. 5:30)." : "Escritas a mano. Escribe 5 o 5:30."}
                    />
                    {r.auto && <span className="pointer-events-none absolute right-2.5 top-1/2 -translate-y-1/2 text-[9px] font-bold uppercase text-faint">auto</span>}
                  </td>
                  <td className="py-1 pr-1">
                    <LlegadaInput
                      value={f?.llegada ?? ""}
                      salida={salida}
                      label={`Llegada de ${r.nombre || `la fila ${i + 1}`}`}
                      onCommit={(llegada) => {
                        // Llegada escrita → horas = salida − llegada (ej. 1:30 a 5:30 = 4 h).
                        const h = diffHoras(llegada, salida);
                        if (h != null && h > 0) update(r.key, { horas: duracionCampo(h) });
                      }}
                    />
                  </td>
                  <td className="tabular py-1 pl-2 text-muted">{f?.salida ? hora12(f.salida, true) : "—"}</td>
                  <td className="tabular py-1 pr-1 text-right">{formatCOP(f?.valor)}</td>
                  <td className="py-1 pl-3 pr-1">
                    <Input className={cell} value={r.pp} maxLength={4} onChange={(e) => update(r.key, { pp: e.target.value })} aria-label="P.P" />
                  </td>
                  <td className="py-1 pr-1">
                    <Input className={cell} value={r.desempeno} maxLength={4} onChange={(e) => update(r.key, { desempeno: e.target.value })} aria-label="Desempeño" />
                  </td>
                  <td className="py-1 pr-1">
                    <Input className={cell} value={r.observacion} maxLength={200} onChange={(e) => update(r.key, { observacion: e.target.value })} aria-label="Observación" />
                  </td>
                  <td className="py-1 pr-2">
                    <button
                      type="button"
                      onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                      className="grid h-7 w-7 place-items-center rounded-ctl text-faint hover:bg-subtle hover:text-danger"
                      aria-label={`Quitar a ${r.nombre || `la fila ${i + 1}`}`}
                    >
                      <IconTrash width={14} height={14} />
                    </button>
                  </td>
                </tr>
              );
            })}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="text-[13px]">
                <td colSpan={4} className="py-3 pl-4 text-muted sm:pl-2">
                  Total · {rows.length} {rows.length === 1 ? "persona" : "personas"}
                </td>
                <td className="tabular whitespace-nowrap py-3 pl-2 font-bold tracking-tight text-[17px]">{formatDuracion(totals.horas)}</td>
                <td colSpan={2} />
                <td className="tabular whitespace-nowrap py-3 pr-1 text-right font-bold tracking-tight text-[17px]">{formatCOP(totals.valor)}</td>
                <td colSpan={4} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Button type="button" size="sm" variant="ghost" icon={<IconPlus />} className="mt-2" onClick={() => onChange([...rows, nuevaPersona()])}>
        Agregar persona
      </Button>
    </div>
  );
}

/**
 * Hora de llegada editable: las horas pasan a ser salida − llegada. Mientras tiene el foco,
 * el campo conserva lo que escribes (no salta entre teclas aunque la tabla se recalcule).
 */
function LlegadaInput({ value, salida, label, onCommit }: { value: string; salida: string | null; label: string; onCommit: (llegada: string) => void }) {
  const [text, setText] = useState(value);
  const [editing, setEditing] = useState(false);
  useEffect(() => {
    if (!editing) setText(value);
  }, [value, editing]);

  function commit() {
    setEditing(false);
    if (text && text !== value) onCommit(text);
  }

  return (
    <Input
      type="time"
      className={cx(cell, "tabular")}
      value={text}
      disabled={!salida}
      title={salida ? `Escribe la llegada: las horas se calculan hasta la salida (${hora12(salida, true)}).` : "Primero define la salida"}
      onFocus={() => setEditing(true)}
      onChange={(e) => {
        // El texto se queda como lo escribes; las horas se actualizan apenas la hora está completa.
        setText(e.target.value);
        if (/^\d{2}:\d{2}$/.test(e.target.value)) onCommit(e.target.value);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter") {
          e.preventDefault();
          (e.target as HTMLInputElement).blur();
        }
      }}
      aria-label={label}
    />
  );
}
