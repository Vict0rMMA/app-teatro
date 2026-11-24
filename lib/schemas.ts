import { z } from "zod";

const hora = z.string().regex(/^\d{2}:\d{2}$/, "usa el formato HH:mm");
const horaOpt = hora.nullable();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa el formato AAAA-MM-DD");
const texto = (max: number) => z.string().trim().max(max);
const entero = (max: number) => z.number().int().min(0).max(max);

/** Persona de la tabla editable. Llegada, salida y valor los recalcula el servidor. */
export const personaSchema = z.object({
  nombre: texto(120).min(1, "falta el nombre"),
  cargo: z.enum(["C", "AC", "A", ""]),
  horas: z.number().min(0).max(24).nullable(),
  pp: texto(10),
  desempeno: texto(10),
  observacion: texto(200),
  ubi: texto(20),
  cc: texto(20),
});

export const workLogInputSchema = z.object({
  placeId: z.string().min(1).max(64),
  /** índice de la persona en la tabla; null = horas escritas a mano */
  fila: z.number().int().min(0).nullable(),
  llegada: horaOpt,
  salida: horaOpt,
  horas: z.number().min(0).max(24).nullable(),
  valor: entero(10_000_000).nullable(),
});

const localidad = z.object({ boletas: entero(100_000).nullable(), valor: entero(10_000_000).nullable(), observacion: texto(120) });

export const generateSchema = z.object({
  evento: texto(160).min(1, "falta el nombre del evento"),
  fecha,
  horaCitacion: hora,
  horaEvento: hora,
  salida: hora,
  aforo: entero(100_000).nullable(),
  notaLlaves: texto(500),
  evaluacion: z.object({
    reclamos: texto(1000),
    aspectosMejorar: texto(1000),
    aspectosPermanecer: texto(1000),
    sugerencias: texto(1000),
    notas: z.array(texto(500)).max(20),
  }),
  localidades: z.object({ lc: localidad, ll: localidad, bc: localidad, bl: localidad }).partial(),
  observaciones: texto(1000),
  objetosPerdidos: texto(500),
  personal: z.array(personaSchema).max(300),
  workLog: workLogInputSchema.nullable(),
});

export type GenerateInput = z.infer<typeof generateSchema>;
export type PersonaInput = z.infer<typeof personaSchema>;

export interface Defaults {
  nota: string;
  observaciones: string;
  objetosPerdidos: string;
  reclamos: string;
  sugerencias: string;
  valorHora: number;
  /** horas extra sobre la base: AC = base + extraAC, C = base + extraC */
  extraAC: number;
  extraC: number;
  /** significado de la columna UBI (letra → nombre). Solo informativo. */
  ubicaciones: Record<string, string>;
}

export const DEFAULTS: Defaults = {
  nota: "La llave del vidrio de balcón izquierdo está mala.",
  observaciones: "El evento transcurrió con normalidad",
  objetosPerdidos: "ninguno",
  reclamos: "El público asistente no presentó ninguna queja ni sugerencias.",
  sugerencias: "No hay sugerencias por parte de los coordinadores.",
  valorHora: 10_000,
  extraAC: 1,
  extraC: 2,
  ubicaciones: { S: "Seguidores" },
};

export function withDefaults(d?: Partial<Defaults> | null): Defaults {
  return { ...DEFAULTS, ...(d ?? {}), ubicaciones: { ...DEFAULTS.ubicaciones, ...(d?.ubicaciones ?? {}) } };
}

export const LUGARES_INICIALES = ["Teatro Universidad de Medellín", "Favor a coordinadores", "Otro"];
export const LUGAR_TEATRO = LUGARES_INICIALES[0];

/** Firma en base64 dentro de users/{uid}.firma: máximo 150 KB. */
export const FIRMA_MAX_BYTES = 150 * 1024;
