import { diffHoras, hora12, formatDuracion } from "../format";

export const VALOR_HORA = 10_000;
export const HORAS_BASE = 4;
/** Horas extra por cargo sobre las horas base (configurables en Ajustes). */
export const EXTRAS = { ac: 1, c: 2 };

type Cargo = "C" | "AC" | "A" | "";
export type Extras = { ac: number; c: number };

/** A = base · AC (apoyo) = base + extra AC · C (coordinador) = base + extra C. */
export function horasPorCargo(cargo: Cargo, base: number, extras: Extras = EXTRAS): number {
  return cargo === "C" ? base + extras.c : cargo === "AC" ? base + extras.ac : base;
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
 * Horas base del evento = horas de los acomodadores (A). Si el archivo trae horas para
 * los A, se toma el valor más repetido; si no, 4.
 */
export function horasBase(rows: Leido[]): number {
  const deA = rows
    .filter((r) => r.cargo === "A" || r.cargo === "")
    .map((r) => r.horas ?? diffHoras(r.llegada, r.salida))
    .filter((h): h is number => h != null && h > 0);
  return moda(deA) ?? HORAS_BASE;
}

/** Texto de la alerta con los números reales de la regla. */
export function mensajeSupuestas(n: number, base: number, extras: Extras = EXTRAS) {
  if (!n) return null;
  const quien = n === 1 ? "1 persona no traía horas" : `${n} personas no traían horas`;
  return `${quien}: base ${formatDuracion(base)}, AC +${formatDuracion(extras.ac)} y C +${formatDuracion(extras.c)}.`;
}

/**
 * Prepara el personal leído del archivo para la tabla editable:
 * - Quien trae horas (o llegada y salida) las conserva.
 * - Quien no trae horas queda en modo automático: A = base, AC = base + 1, C = base + 2.
 * - P.P y DESEMP: 5 si vienen vacíos.
 * - Salida sugerida: la más escrita en el archivo o, si no hay, citación + horas base.
 */
export function prepararPersonal<T extends Leido>(rows: T[], horaCitacion: string | null, extras: Extras = EXTRAS) {
  const base = horasBase(rows);
  let auto = 0;
  const out = rows.map((r) => {
    const propias = r.horas ?? diffHoras(r.llegada, r.salida);
    if (propias == null) auto++;
    return {
      ...r,
      horas: propias ?? horasPorCargo(r.cargo, base, extras),
      auto: propias == null,
      pp: r.pp.trim() || "5",
      desempeno: r.desempeno.trim() || "5",
    };
  });
  const msg = mensajeSupuestas(auto, base, extras);
  return { rows: out, base, salida: salidaSugerida(rows, horaCitacion, base), supuestos: msg ? [msg] : [] };
}

/** Salida común: la más escrita en el archivo o, si no hay, citación + horas base. */
export function salidaSugerida(rows: Array<{ salida?: string | null }>, horaCitacion: string | null, base: number): string | null {
  const escrita = moda(rows.map((r) => r.salida).filter((s): s is string => !!s));
  if (escrita) return escrita;
  return horaCitacion ? fromMin(toMin(horaCitacion) + base * 60) : null;
}

export interface Persona {
  nombre: string;
  horas: number | null;
  /** salida propia (si se fue a otra hora); si no, la común */
  salida?: string | null;
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
    const salida = p.salida || opts.salida;
    return {
      horas: ok ? p.horas : null,
      salida,
      llegada: ok && salida ? fromMin(toMin(salida) - (p.horas as number) * 60) : null,
      valor: ok ? Math.round((p.horas as number) * valorHora) : null,
    };
  });

  const alertas: string[] = [];
  const nombre = (i: number) => personas[i].nombre.trim() || `la fila ${i + 1}`;
  personas.forEach((p, i) => {
    if (p.horas == null || p.horas <= 0) alertas.push(`Falta las horas de ${nombre(i)}.`);
    else if (p.horas > 16) alertas.push(`${nombre(i)} tiene ${formatDuracion(p.horas)}: revisa.`);
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
