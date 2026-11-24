"use client";

import { formatCOP, formatHoras, hora12 } from "@/lib/format";
import type { FilaCalculada } from "@/lib/registro/calculo";
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
  /** viene del archivo: nombre y cargo no se editan */
  delArchivo: boolean;
  supuesta: boolean;
}

export const nuevaPersona = (): PersonaDraft => ({
  key: Math.random().toString(36).slice(2),
  nombre: "",
  cargo: "A",
  horas: "4",
  pp: "5",
  desempeno: "5",
  observacion: "",
  ubi: "",
  cc: "",
  delArchivo: false,
  supuesta: false,
});

export function horasDe(p: PersonaDraft): number | null {
  const n = Number(p.horas.replace(",", "."));
  return p.horas.trim() === "" || !Number.isFinite(n) ? null : n;
}

const cell = "h-8 rounded border-transparent bg-transparent px-2 text-[13px] hover:border-border focus:border-fg/30 focus:bg-surface";

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
}: {
  rows: PersonaDraft[];
  filas: FilaCalculada[];
  totals: { horas: number; valor: number };
  onChange: (rows: PersonaDraft[]) => void;
  highlight?: string | null;
}) {
  const update = (key: string, patch: Partial<PersonaDraft>) => onChange(rows.map((r) => (r.key === key ? { ...r, ...patch, supuesta: "horas" in patch ? false : r.supuesta } : r)));

  return (
    <div>
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[920px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="w-8 py-2 pl-4 font-medium sm:pl-2">N°</th>
              <th className="py-2 font-medium">Nombre</th>
              <th className="w-16 py-2 font-medium">Cargo</th>
              <th className="w-20 py-2 font-medium">Horas</th>
              <th className="w-[84px] py-2 font-medium">Llegada</th>
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
              const sinHoras = horasDe(r) == null || (horasDe(r) ?? 0) <= 0;
              return (
                <tr key={r.key} className={cx("border-b border-border/70", highlight === r.key && "bg-brand-soft/50")}>
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
                    <Input
                      inputMode="decimal"
                      className={cx(cell, "tabular", sinHoras && "border-warn/60 bg-warn/5", r.supuesta && "text-warn")}
                      value={r.horas}
                      onChange={(e) => update(r.key, { horas: e.target.value.replace(/[^\d.,]/g, "") })}
                      aria-label={`Horas de ${r.nombre || `la fila ${i + 1}`}`}
                      title={r.supuesta ? "Supuesta por cargo: confírmala" : undefined}
                    />
                  </td>
                  <td className="tabular py-1 pl-2 text-muted">{f?.llegada ? hora12(f.llegada, true) : "—"}</td>
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
                      className="grid h-7 w-7 place-items-center rounded text-faint hover:bg-subtle hover:text-danger"
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
              <tr className="text-[13px] font-medium">
                <td colSpan={3} className="py-2.5 pl-4 text-muted sm:pl-2">
                  Total · {rows.length} {rows.length === 1 ? "persona" : "personas"}
                </td>
                <td className="tabular py-2.5 pl-2">{formatHoras(totals.horas)}</td>
                <td colSpan={2} />
                <td className="tabular py-2.5 pr-1 text-right">{formatCOP(totals.valor)}</td>
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
