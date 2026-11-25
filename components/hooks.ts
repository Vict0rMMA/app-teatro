"use client";

import { useEffect, useState } from "react";
import { addPlace } from "@/lib/data";
import { watchPlaces, type WorkPlace } from "@/lib/data";
import { LUGAR_TEATRO, LUGARES_NUEVOS } from "@/lib/schemas";
import { normalize } from "@/lib/format";

export function usePlaces(uid: string) {
  const [places, setPlaces] = useState<WorkPlace[] | null>(null);
  useEffect(() => watchPlaces(uid, setPlaces), [uid]);
  // Cuentas creadas antes de un lugar nuevo: se agrega una vez. Si luego lo borran, no vuelve.
  useEffect(() => {
    if (!places?.length) return;
    for (const nombre of LUGARES_NUEVOS) {
      const k = `lugar-agregado:${uid}:${normalize(nombre)}`;
      if (localStorage.getItem(k)) continue;
      localStorage.setItem(k, "1");
      if (!places.some((p) => normalize(p.nombre) === normalize(nombre))) void addPlace(uid, nombre).catch(() => localStorage.removeItem(k));
    }
  }, [places, uid]);
  const teatro = places?.find((p) => normalize(p.nombre) === normalize(LUGAR_TEATRO)) ?? places?.[0] ?? null;
  return { places, teatroId: teatro?.id ?? "" };
}

/** Descarga un Blob con el nombre indicado. */
export function saveBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function filenameFrom(res: Response, fallback: string) {
  const cd = res.headers.get("content-disposition") ?? "";
  const star = cd.match(/filename\*=UTF-8''([^;]+)/);
  if (star) return decodeURIComponent(star[1]);
  return cd.match(/filename="([^"]+)"/)?.[1] ?? fallback;
}
