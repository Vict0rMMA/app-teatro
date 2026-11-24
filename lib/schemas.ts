import { z } from "zod";

const hora = z.string().regex(/^\d{2}:\d{2}$/, "usa el formato HH:mm");
const horaOpt = hora.nullable();
const fecha = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "usa el formato AAAA-MM-DD");
const texto = (max: number) => z.string().trim().max(max);

export const staffSchema = z.object({
  nombre: texto(120).min(1, "falta el nombre"),
  cargo: z.enum(["C", "AC", "A", ""]),
  llegada: horaOpt,
  salida: horaOpt,
  horas: z.number().min(0).max(24).nullable(),
  valor: z.number().int().min(0).max(10_000_000).nullable(),
  pp: texto(10),
  desempeno: texto(10),
});

export const workLogInputSchema = z.object({
  placeId: z.string().min(1).max(64),
  llegada: horaOpt,
  salida: horaOpt,
  horas: z.number().min(0).max(24).nullable(),
  valor: z.number().int().min(0).max(10_000_000).nullable(),
});

export const generateSchema = z.object({
  evento: texto(160).min(1, "falta el nombre del evento"),
  fecha,
  horaCitacion: hora,
  horaEvento: hora,
  aforo: z.number().int().min(0).max(100_000).nullable(),
  nota: texto(500),
  observaciones: texto(1000),
  objetosPerdidos: texto(500),
  staff: z.array(staffSchema).max(300),
  workLog: workLogInputSchema.nullable(),
});

export const registroFillSchema = z.object({
  evento: texto(160).min(1),
  staff: z.array(staffSchema).max(300),
});

export type GenerateInput = z.infer<typeof generateSchema>;
export type StaffInput = z.infer<typeof staffSchema>;

export const DEFAULTS = {
  nota: "La llave del vidrio de balcón izquierdo está mala.",
  observaciones: "El evento transcurrió con normalidad",
  objetosPerdidos: "ninguno",
};

export const LUGARES_INICIALES = ["Teatro Universidad de Medellín", "Favor a coordinadores", "Otro"];
export const LUGAR_TEATRO = LUGARES_INICIALES[0];
