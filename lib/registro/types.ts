export type Cargo = "C" | "AC" | "A" | "";

/** Fila completa tal como se lee del archivo. Solo vive en memoria del servidor. */
export interface StaffRowRaw {
  n: number;
  nombre: string;
  cedula: string;
  telefono: string;
  ubi: string;
  llegada: string | null;
  salida: string | null;
  horas: number | null;
  valor: number | null;
  cargo: Cargo;
  pp: string;
  desempeno: string;
  cc: string;
  observacion: string;
}

/** Fila que sale del servidor: sin cédula ni teléfono. */
export type StaffRow = Omit<StaffRowRaw, "cedula" | "telefono">;

export interface Registro<Row = StaffRowRaw> {
  evento: string;
  fecha: string | null;
  fechaTexto: string;
  horaCitacion: string | null;
  horaEvento: string | null;
  staff: Row[];
  warnings: string[];
}

export class RegistroError extends Error {
  constructor(
    public code: "ARCHIVO_INVALIDO" | "FORMATO_NO_RECONOCIDO" | "SIN_TABLA" | "SIN_PERSONAL",
    message: string,
  ) {
    super(message);
    this.name = "RegistroError";
  }
}
