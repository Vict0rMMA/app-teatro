"use client";

import { diffHoras, formatCOP, formatHoras } from "@/lib/format";
import { IconPlus, IconTrash } from "./icons";
import { Button, Input, Select, cx } from "./ui";

export interface StaffDraft {
  key: string;
  nombre: string;
  cargo: "C" | "AC" | "A" | "";
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  valor: number | null;
  pp: string;
  desempeno: string;
}

export const newStaffRow = (): StaffDraft => ({
  key: Math.random().toString(36).slice(2),
  nombre: "",
  cargo: "A",
  llegada: null,
  salida: null,
  horas: null,
  valor: null,
  pp: "",
  desempeno: "",
});

export function staffTotals(rows: StaffDraft[]) {
  return {
    horas: rows.reduce((a, r) => a + (r.horas ?? 0), 0),
    valor: rows.reduce((a, r) => a + (r.valor ?? 0), 0),
  };
}

const cell = "h-8 rounded border-transparent bg-transparent px-2 text-[13px] hover:border-border focus:border-fg/30 focus:bg-surface";

export function StaffEditor({
  rows,
  onChange,
  highlight,
}: {
  rows: StaffDraft[];
  onChange: (rows: StaffDraft[]) => void;
  highlight?: string | null;
}) {
  function update(key: string, patch: Partial<StaffDraft>) {
    onChange(
      rows.map((r) => {
        if (r.key !== key) return r;
        const next = { ...r, ...patch };
        // Recalcula las horas si cambian llegada o salida.
        if (("llegada" in patch || "salida" in patch) && next.llegada && next.salida) {
          next.horas = diffHoras(next.llegada, next.salida);
        }
        return next;
      }),
    );
  }

  const totals = staffTotals(rows);

  return (
    <div>
      <div className="-mx-4 overflow-x-auto sm:mx-0">
        <table className="w-full min-w-[760px] border-collapse text-[13px]">
          <thead>
            <tr className="border-b border-border text-left text-[11px] uppercase tracking-wide text-faint">
              <th className="w-8 py-2 pl-4 font-medium sm:pl-2">N°</th>
              <th className="py-2 font-medium">Nombre</th>
              <th className="w-20 py-2 font-medium">Cargo</th>
              <th className="w-28 py-2 font-medium">Llegada</th>
              <th className="w-28 py-2 font-medium">Salida</th>
              <th className="w-16 py-2 font-medium">Horas</th>
              <th className="w-28 py-2 font-medium">Valor</th>
              <th className="w-12 py-2 font-medium">P.P</th>
              <th className="w-14 py-2 font-medium">Desemp.</th>
              <th className="w-9" />
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={r.key} className={cx("border-b border-border/70", highlight === r.key && "bg-brand-soft/50")}>
                <td className="tabular py-1 pl-4 text-faint sm:pl-2">{i + 1}</td>
                <td className="py-1 pr-1">
                  <Input className={cell} value={r.nombre} onChange={(e) => update(r.key, { nombre: e.target.value })} aria-label={`Nombre fila ${i + 1}`} />
                </td>
                <td className="py-1 pr-1">
                  <Select className={cell} value={r.cargo} onChange={(e) => update(r.key, { cargo: e.target.value as StaffDraft["cargo"] })} aria-label="Cargo">
                    <option value="C">C</option>
                    <option value="AC">AC</option>
                    <option value="A">A</option>
                    <option value="">—</option>
                  </Select>
                </td>
                <td className="py-1 pr-1">
                  <Input type="time" className={cell} value={r.llegada ?? ""} onChange={(e) => update(r.key, { llegada: e.target.value || null })} aria-label="Llegada" />
                </td>
                <td className="py-1 pr-1">
                  <Input type="time" className={cell} value={r.salida ?? ""} onChange={(e) => update(r.key, { salida: e.target.value || null })} aria-label="Salida" />
                </td>
                <td className="py-1 pr-1">
                  <Input
                    inputMode="decimal"
                    className={cx(cell, "tabular")}
                    value={r.horas ?? ""}
                    onChange={(e) => update(r.key, { horas: e.target.value === "" ? null : Number(e.target.value.replace(",", ".")) || 0 })}
                    aria-label="Horas"
                  />
                </td>
                <td className="py-1 pr-1">
                  <Input
                    inputMode="numeric"
                    className={cx(cell, "tabular")}
                    value={r.valor ?? ""}
                    onChange={(e) => {
                      const d = e.target.value.replace(/\D/g, "");
                      update(r.key, { valor: d ? Number(d) : null });
                    }}
                    aria-label="Valor pagado"
                  />
                </td>
                <td className="py-1 pr-1">
                  <Input className={cell} value={r.pp} maxLength={10} onChange={(e) => update(r.key, { pp: e.target.value })} aria-label="P.P" />
                </td>
                <td className="py-1 pr-1">
                  <Input className={cell} value={r.desempeno} maxLength={10} onChange={(e) => update(r.key, { desempeno: e.target.value })} aria-label="Desempeño" />
                </td>
                <td className="py-1 pr-2">
                  <button
                    type="button"
                    onClick={() => onChange(rows.filter((x) => x.key !== r.key))}
                    className="grid h-7 w-7 place-items-center rounded text-faint hover:bg-subtle hover:text-danger"
                    aria-label={`Quitar fila ${i + 1}`}
                  >
                    <IconTrash width={14} height={14} />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
          {rows.length > 0 && (
            <tfoot>
              <tr className="text-[13px] font-medium">
                <td colSpan={5} className="py-2.5 pl-4 text-muted sm:pl-2">
                  Total · {rows.length} {rows.length === 1 ? "persona" : "personas"}
                </td>
                <td className="tabular py-2.5">{formatHoras(totals.horas)}</td>
                <td className="tabular py-2.5">{formatCOP(totals.valor)}</td>
                <td colSpan={3} />
              </tr>
            </tfoot>
          )}
        </table>
      </div>
      <Button type="button" size="sm" variant="ghost" icon={<IconPlus />} className="mt-2" onClick={() => onChange([...rows, newStaffRow()])}>
        Agregar persona
      </Button>
    </div>
  );
}
