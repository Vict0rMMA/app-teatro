import { FieldValue } from "firebase-admin/firestore";
import { NextResponse } from "next/server";
import { HttpError, handleError, rateLimit, requireUser } from "@/lib/api";
import { generarPlanillas } from "@/lib/docx/planillas";
import { adminBucket, adminDb } from "@/lib/firebase/admin";
import { mensajeWhatsapp, normalize, titleCase } from "@/lib/format";
import { generateSchema } from "@/lib/schemas";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 30;

const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

export async function POST(req: Request) {
  try {
    const user = await requireUser(req);
    await rateLimit(user.uid, "generate", 20, 60 * 60 * 1000);
    const input = generateSchema.parse(await req.json());

    const db = adminDb();
    const bucket = adminBucket();
    const profile = (await db.collection("users").doc(user.uid).get()).data();
    if (!profile?.nombre) throw new HttpError(409, "Completa tu nombre en Ajustes antes de generar planillas.", "SIN_PERFIL");

    let firma: Buffer | null = null;
    if (profile.firmaPath) {
      const [exists] = await bucket.file(profile.firmaPath).exists();
      if (exists) [firma] = await bucket.file(profile.firmaPath).download();
    }

    if (input.workLog) {
      const place = await db.collection("workPlaces").doc(input.workLog.placeId).get();
      if (!place.exists || place.data()?.uid !== user.uid) {
        throw new HttpError(400, "El lugar de trabajo seleccionado no existe.", "LUGAR_INVALIDO");
      }
    }

    const files = generarPlanillas({
      evento: input.evento,
      fecha: input.fecha,
      horaEvento: input.horaEvento,
      horaCitacion: input.horaCitacion,
      coordinador: profile.nombre,
      notaLlaves: input.nota,
      aforo: input.aforo,
      evaluacion: {
        reclamos: "El público asistente no presentó ninguna queja ni sugerencias.",
        aspectosMejorar: "",
        aspectosPermanecer: "",
        sugerencias: "No hay sugerencias por parte de los coordinadores.",
        notas: input.nota ? [input.nota] : [],
      },
      localidades: {},
      firma,
    });

    const eventRef = db.collection("events").doc();
    const stored = await Promise.all(
      files.map(async (f) => {
        const path = `users/${user.uid}/planillas/${eventRef.id}/${f.name}`;
        await bucket.file(path).save(f.buffer, { contentType: DOCX, resumable: false });
        return { template: f.template, name: f.name, path };
      }),
    );

    const whatsapp = mensajeWhatsapp(input);
    const totalHoras = input.staff.reduce((a, s) => a + (s.horas ?? 0), 0);
    const totalPagado = input.staff.reduce((a, s) => a + (s.valor ?? 0), 0);
    const nombre = titleCase(input.evento);

    const batch = db.batch();
    batch.set(eventRef, {
      uid: user.uid,
      nombre,
      nombreNorm: normalize(nombre),
      fecha: input.fecha,
      horaCitacion: input.horaCitacion,
      horaEvento: input.horaEvento,
      aforo: input.aforo,
      nota: input.nota,
      observaciones: input.observaciones,
      objetosPerdidos: input.objetosPerdidos,
      whatsapp,
      files: stored,
      staffCount: input.staff.length,
      totalHoras,
      totalPagado,
      createdAt: FieldValue.serverTimestamp(),
    });
    // Personal del evento: nunca cédula ni teléfono (el esquema ni siquiera los acepta).
    input.staff.forEach((s, i) => {
      batch.set(eventRef.collection("staff").doc(String(i + 1).padStart(3, "0")), {
        ...s,
        uid: user.uid,
        eventId: eventRef.id,
        evento: nombre,
        fecha: input.fecha,
        orden: i + 1,
        nombreNorm: normalize(s.nombre),
      });
    });
    if (input.workLog) {
      batch.set(db.collection("workLogs").doc(), {
        ...input.workLog,
        uid: user.uid,
        eventId: eventRef.id,
        evento: nombre,
        fecha: input.fecha,
        origen: "archivo",
        createdAt: FieldValue.serverTimestamp(),
        updatedAt: FieldValue.serverTimestamp(),
      });
    }
    await batch.commit();

    return NextResponse.json({ eventId: eventRef.id, files: stored, whatsapp });
  } catch (err) {
    return handleError(err);
  }
}
