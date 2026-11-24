import { diffHoras, formatHoras, hora12 } from "../format";

export const VALOR_HORA = 10_000;
export const HORAS_POR_CARGO = { C: 6, AC: 5, A: 4 } as const;

type Cargo = "C" | "AC" | "A" | "";

export function horasPorCargo(cargo: Cargo): number {
  return cargo === "C" ? HORAS_POR_CARGO.C : cargo === "AC" ? HORAS_POR_CARGO.AC : HORAS_POR_CARGO.A;
}

export function toMin(hhmm: string) {
  const [h, m] = hhmm.split(":").map(Number);
  return h * 60 + m;
}
export function fromMin(min: number) {
  const m = ((Math.round(min) % 1440) + 1440) % 1440;
  return `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
}

/** Valor más frecuente; en empate gana el primero que aparece. */
export function moda<T>(values: T[]): T | null {
  const counts = new Map<T, number>();
  for (const v of values) counts.set(v, (counts.get(v) ?? 0) + 1);
  let best: T | null = null;
  let n = 0;
  for (const [v, c] of counts) if (c > n) [best, n] = [v, c];
  return best;
}

interface Leido {
  cargo: Cargo;
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  pp: string;
  desempeno: string;
}

/**
 * Prepara el personal leído del archivo para la tabla editable:
 * - Horas: las del archivo; si faltan, desde llegada/salida; si tampoco, C 6 h, AC 5 h, resto 4 h (suposición).
 * - P.P y DESEMP: 5 si vienen vacíos.
 * - Salida común sugerida: la más escrita en el archivo o, si no hay, citación + horas del grupo más numeroso.
 */
export function prepararPersonal<T extends Leido>(rows: T[], horaCitacion: string | null) {
  let supuestas = 0;
  const out = rows.map((r) => {
    let horas = r.horas ?? diffHoras(r.llegada, r.salida);
    let supuesta = false;
    if (horas == null) {
      horas = horasPorCargo(r.cargo);
      supuesta = true;
      supuestas++;
    }
    return { ...r, horas, supuesta, pp: r.pp.trim() || "5", desempeno: r.desempeno.trim() || "5" };
  });
  const supuestos: string[] = [];
  if (supuestas) {
    supuestos.push(
      supuestas === rows.length
        ? "El registro no traía horas: supuse coordinador 6 h, AC 5 h y el resto 4 h."
        : `${supuestas} ${supuestas === 1 ? "persona no traía" : "personas no traían"} horas: supuse C 6 h, AC 5 h y resto 4 h.`,
    );
  }
  return { rows: out, salida: salidaSugerida(out, horaCitacion), supuestos };
}

export function salidaSugerida(rows: Array<{ salida?: string | null; horas: number | null }>, horaCitacion: string | null): string | null {
  const escrita = moda(rows.map((r) => r.salida).filter((s): s is string => !!s));
  if (escrita) return escrita;
  const base = moda(rows.map((r) => r.horas).filter((h): h is number => h != null && h > 0));
  return horaCitacion && base != null ? fromMin(toMin(horaCitacion) + base * 60) : null;
}

export interface Persona {
  nombre: string;
  horas: number | null;
}

export interface FilaCalculada {
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  valor: number | null;
}

/**
 * Recalcula llegada, salida y valor de cada persona y los totales:
 * SALIDA común · LLEGADA = SALIDA − horas · VALOR = horas × valor por hora.
 */
export function calcularRegistro(
  personas: Persona[],
  opts: { salida: string | null; horaCitacion: string | null; valorHora?: number },
) {
  const valorHora = opts.valorHora ?? VALOR_HORA;
  const filas: FilaCalculada[] = personas.map((p) => {
    const ok = p.horas != null && p.horas > 0;
    return {
      horas: ok ? p.horas : null,
      salida: opts.salida,
      llegada: ok && opts.salida ? fromMin(toMin(opts.salida) - (p.horas as number) * 60) : null,
      valor: ok ? Math.round((p.horas as number) * valorHora) : null,
    };
  });

  const alertas: string[] = [];
  const nombre = (i: number) => personas[i].nombre.trim() || `la fila ${i + 1}`;
  personas.forEach((p, i) => {
    if (p.horas == null || p.horas <= 0) alertas.push(`Falta las horas de ${nombre(i)}.`);
    else if (p.horas > 16) alertas.push(`${nombre(i)} tiene ${formatHoras(p.horas)} h: revisa.`);
  });
  if (!opts.salida) alertas.push("Falta la hora de salida.");
  if (opts.salida && opts.horaCitacion) {
    const jornada = (toMin(opts.salida) - toMin(opts.horaCitacion) + 1440) % 1440;
    if (jornada === 0 || jornada > 16 * 60) {
      alertas.push(`La salida (${hora12(opts.salida)}) no es coherente con la citación (${hora12(opts.horaCitacion)}).`);
    } else {
      filas.forEach((f, i) => {
        if (f.horas != null && f.horas * 60 < jornada) {
          alertas.push(`${nombre(i)} llega a las ${hora12(f.llegada)}, después de la citación (${hora12(opts.horaCitacion)}).`);
        }
      });
    }
  }

  return {
    filas,
    totalHoras: filas.reduce((a, f) => a + (f.horas ?? 0), 0),
    totalValor: filas.reduce((a, f) => a + (f.valor ?? 0), 0),
    alertas,
  };
}
