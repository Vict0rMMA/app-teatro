import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { HttpError, handleError, rateLimit, requireUser } from "@/lib/api";
import { isPng, renderRegistro } from "@/lib/docx/planillas";
import { adminDb } from "@/lib/firebase/admin";
import { mensajeWhatsapp, nombresArchivo, normalize, titleCase } from "@/lib/format";
import type { EventoGuardado, StaffGuardado } from "@/lib/planillas-evento";
import { MAX_UPLOAD_BYTES, parseRegistro, RegistroError } from "@/lib/registro";
import { calcularRegistro } from "@/lib/registro/calculo";
import { fillRegistroDocx, type RegistroPersona } from "@/lib/registro/docx";
import { FIRMA_MAX_BYTES, generateSchema, withDefaults } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

/**
 * Guarda el evento (datos, no archivos) y devuelve el REGISTRO completado una sola vez:
 * lleva cédulas y teléfonos y por eso no se guarda. LLAVES, COLILLAS y EVALUACIÓN se
 * regeneran al descargarlas. Multipart:
 *   payload   JSON (generateSchema)
 *   registro  archivo original .docx/.pdf (opcional, solo en memoria)
 *   firma     PNG solo para este evento (opcional)
 */
export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    const form = await req.formData().catch(() => null);
    if (!form) throw new HttpError(400, "Solicitud inválida.");
    const input = generateSchema.parse(JSON.parse(String(form.get("payload") ?? "{}")));
    await rateLimit(user.uid, "generate", 20, 60 * 60 * 1000);

    const db = adminDb();
    const profile = (await db.collection("users").doc(user.uid).get()).data();
    if (!profile?.nombre) throw new HttpError(409, "Completa tu nombre en Ajustes antes de generar planillas.", "SIN_PERFIL");
    const defaults = withDefaults(profile.defaults);

    let firmaEvento: string | null = null;
    const firmaFile = form.get("firma");
    if (firmaFile instanceof File && firmaFile.size) {
      if (firmaFile.size > FIRMA_MAX_BYTES) throw new HttpError(413, "La firma supera 150 KB.");
      const buf = Buffer.from(await firmaFile.arrayBuffer());
      if (!isPng(buf)) throw new HttpError(400, "La firma debe ser PNG.");
      firmaEvento = buf.toString("base64");
    }

    if (input.workLog) {
      const place = await db.collection("workPlaces").doc(input.workLog.placeId).get();
      if (!place.exists || place.data()?.uid !== user.uid) throw new HttpError(400, "El lugar de trabajo seleccionado no existe.", "LUGAR_INVALIDO");
    }

    // Llegada, salida, valor y totales se recalculan aquí con las mismas reglas que la pantalla.
    const calc = calcularRegistro(input.personal, { salida: input.salida, horaCitacion: input.horaCitacion, valorHora: defaults.valorHora });
    const personas: RegistroPersona[] = input.personal.map((p, i) => ({ ...p, ...calc.filas[i] }));
    const totals = { horas: calc.totalHoras, valor: calc.totalValor };

    // REGISTRO: el mismo .docx editado, o la plantilla si era PDF o no hubo archivo.
    const datosRegistro = { evento: input.evento, fecha: input.fecha, horaCitacion: input.horaCitacion, horaEvento: input.horaEvento, totals };
    const original = form.get("registro");
    let registro: Buffer;
    if (original instanceof File && original.size) {
      if (original.size > MAX_UPLOAD_BYTES) throw new HttpError(413, "El registro supera 10 MB.");
      const buf = Buffer.from(await original.arrayBuffer());
      try {
        if (/\.docx$/i.test(original.name)) {
          registro = fillRegistroDocx(buf, personas, totals);
        } else {
          // PDF: cédulas y teléfonos se leen en memoria para pasarlos al registro nuevo.
          const leido = await parseRegistro(original.name, buf);
          const pool = leido.staff.map((s) => ({ s, used: false }));
          const conDatos = personas.map((p) => {
            const m = pool.find((x) => !x.used && normalize(x.s.nombre) === normalize(p.nombre));
            if (m) m.used = true;
            return m ? { ...p, cedula: m.s.cedula, telefono: m.s.telefono, ubi: p.ubi || m.s.ubi, cc: p.cc || m.s.cc } : p;
          });
          registro = renderRegistro({ ...datosRegistro, personas: conDatos });
        }
      } catch (err) {
        if (!(err instanceof RegistroError)) throw err;
        registro = renderRegistro({ ...datosRegistro, personas });
      }
    } else {
      registro = renderRegistro({ ...datosRegistro, personas });
    }

    const nombre = titleCase(input.evento);
    const whatsapp = mensajeWhatsapp({ ...input, evento: nombre });
    const evento: EventoGuardado = {
      uid: user.uid,
      nombre,
      evento: input.evento,
      fecha: input.fecha,
      horaCitacion: input.horaCitacion,
      horaEvento: input.horaEvento,
      salida: input.salida,
      aforo: input.aforo,
      notaLlaves: input.notaLlaves,
      evaluacion: input.evaluacion,
      localidades: input.localidades,
      observaciones: input.observaciones,
      objetosPerdidos: input.objetosPerdidos,
      coordinador: profile.nombre,
      firmaEvento,
      whatsapp,
      staffCount: personas.length,
      totalHoras: totals.horas,
      totalPagado: totals.valor,
    };
    const eventRef = db.collection("events").doc();
    const batch = db.batch();
    batch.set(eventRef, {
      ...evento,
      nombreNorm: normalize(nombre),
      sinFirma: !firmaEvento && !profile.firma,
      createdAt: FieldValue.serverTimestamp(),
    });
    // Personal del evento: nunca cédula ni teléfono.
    personas.forEach((p, i) => {
      const s: StaffGuardado = {
        orden: i + 1,
        nombre: p.nombre,
        cargo: p.cargo as StaffGuardado["cargo"],
        llegada: p.llegada,
        salida: p.salida,
        horas: p.horas,
        valor: p.valor,
        pp: p.pp,
        desempeno: p.desempeno,
        observacion: p.observacion,
        ubi: p.ubi ?? "",
      };
      batch.set(eventRef.collection("staff").doc(String(i + 1).padStart(3, "0")), {
        ...s,
        uid: user.uid,
        eventId: eventRef.id,
        evento: nombre,
        fecha: input.fecha,
        nombreNorm: normalize(p.nombre),
      });
    });
    if (input.workLog) {
      const w = input.workLog;
      const fila = w.fila != null ? personas[w.fila] : null;
      batch.set(db.collection("workLogs").doc(), {
        uid: user.uid,
        eventId: eventRef.id,
        evento: nombre,
        fecha: input.fecha,
        placeId: w.placeId,
        llegada: fila ? fila.llegada : w.llegada,
        salida: fila ? fila.salida : w.salida,
        horas: fila ? fila.horas : w.horas,
        valor: fila ? fila.valor : w.valor,
        origen: "archivo",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    return NextResponse.json({
      eventId: eventRef.id,
      whatsapp,
      registro: { name: nombresArchivo(input.evento, input.fecha).registro, base64: registro.toString("base64") },
      alertas: calc.alertas,
      sinFirma: !firmaEvento && !profile.firma,
    });
  } catch (err) {
    return handleError(err);
  }
}
