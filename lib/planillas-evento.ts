import "server-only";
import { generarPlanillas, renderRegistro, type GeneratedFile } from "./docx/planillas";
import { nombresArchivo } from "./format";
import type { RegistroPersona } from "./registro/docx";
import type { GenerateInput } from "./schemas";

/**
 * Datos de un evento guardados en Firestore (events/{id}). No se guardan los .docx:
 * con esto se regeneran idénticos al descargar. El personal va en events/{id}/staff.
 */
export interface EventoGuardado {
  uid: string;
  nombre: string;
  evento: string;
  fecha: string;
  horaCitacion: string;
  horaEvento: string;
  salida: string;
  aforo: number | null;
  notaLlaves: string;
  evaluacion: GenerateInput["evaluacion"];
  localidades: GenerateInput["localidades"];
  observaciones: string;
  objetosPerdidos: string;
  coordinador: string;
  /** firma dibujada solo para este evento (base64 PNG); si no hay, se usa la del perfil */
  firmaEvento: string | null;
  whatsapp: string;
  staffCount: number;
  totalHoras: number;
  totalPagado: number;
}

export interface StaffGuardado {
  nombre: string;
  cargo: "C" | "AC" | "A" | "";
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  valor: number | null;
  pp: string;
  desempeno: string;
  observacion: string;
  ubi: string;
  orden: number;
}

export function planillasDeEvento(ev: EventoGuardado, firmaPerfil: Buffer | null): GeneratedFile[] {
  const firma = ev.firmaEvento ? Buffer.from(ev.firmaEvento, "base64") : firmaPerfil;
  return generarPlanillas({
    evento: ev.evento,
    fecha: ev.fecha,
    horaEvento: ev.horaEvento,
    horaCitacion: ev.horaCitacion,
    coordinador: ev.coordinador,
    aforo: ev.aforo,
    notaLlaves: ev.notaLlaves,
    evaluacion: ev.evaluacion,
    localidades: ev.localidades ?? {},
    firma,
  });
}

/** REGISTRO regenerado desde la plantilla, sin cédulas ni teléfonos (nunca se guardan). */
export function registroDeEvento(ev: EventoGuardado, staff: StaffGuardado[]) {
  const personas: RegistroPersona[] = staff.map((s) => ({ ...s }));
  return {
    name: nombresArchivo(ev.evento, ev.fecha).registro,
    buffer: renderRegistro({
      evento: ev.evento,
      fecha: ev.fecha,
      horaCitacion: ev.horaCitacion,
      horaEvento: ev.horaEvento,
      personas,
      totals: { horas: ev.totalHoras, valor: ev.totalPagado },
    }),
  };
}
