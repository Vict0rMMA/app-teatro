"use client";

/** La firma se guarda en base64 dentro de Firestore: máximo 150 KB. */
export const FIRMA_MAX_BYTES = 150 * 1024;

function toBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((r) => canvas.toBlob(r, "image/png"));
}

/** Caja que contiene los píxeles no transparentes (alpha > umbral). */
export function alphaBounds(img: ImageData, minAlpha = 8) {
  const { width: w, height: h, data } = img;
  let x0 = w,
    y0 = h,
    x1 = -1,
    y1 = -1;
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      if (data[(y * w + x) * 4 + 3] > minAlpha) {
        if (x < x0) x0 = x;
        if (x > x1) x1 = x;
        if (y < y0) y0 = y;
        if (y > y1) y1 = y;
      }
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * Recorta al contorno (con un pequeño margen), limita el ancho y reduce hasta que
 * el PNG pese menos de 150 KB. Devuelve PNG transparente.
 */
export async function trimAndScale(source: HTMLCanvasElement, maxWidth: number): Promise<Blob | null> {
  for (let w = maxWidth; w >= 200; w = Math.round(w * 0.8)) {
    const png = await trimAndScaleOnce(source, w);
    if (!png || png.size <= FIRMA_MAX_BYTES) return png;
  }
  return trimAndScaleOnce(source, 200);
}

async function trimAndScaleOnce(source: HTMLCanvasElement, maxWidth: number): Promise<Blob | null> {
  const ctx = source.getContext("2d", { willReadFrequently: true })!;
  const img = ctx.getImageData(0, 0, source.width, source.height);
  const b = alphaBounds(img);
  if (!b) return null;
  const pad = Math.round(Math.max(b.w, b.h) * 0.03) + 2;
  const sx = Math.max(0, b.x - pad);
  const sy = Math.max(0, b.y - pad);
  const sw = Math.min(source.width - sx, b.w + pad * 2);
  const sh = Math.min(source.height - sy, b.h + pad * 2);
  const scale = Math.min(1, maxWidth / sw);
  const out = document.createElement("canvas");
  out.width = Math.max(1, Math.round(sw * scale));
  out.height = Math.max(1, Math.round(sh * scale));
  const octx = out.getContext("2d")!;
  octx.imageSmoothingQuality = "high";
  octx.drawImage(source, sx, sy, sw, sh, 0, 0, out.width, out.height);
  return toBlob(out);
}

/** Carga una imagen respetando la orientación EXIF (fotos del celular) y la reduce a maxSide. */
export async function loadImage(file: File, maxSide = 1600): Promise<HTMLCanvasElement> {
  if (!file.type.startsWith("image/")) throw new Error("El archivo no es una imagen.");
  if (file.size > 25 * 1024 * 1024) throw new Error("La imagen es demasiado grande.");
  const url = URL.createObjectURL(file);
  try {
    const img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const i = new Image();
      i.onload = () => resolve(i);
      i.onerror = () => reject(new Error("No se pudo abrir la imagen. Usa PNG o JPG."));
      i.src = url;
    });
    const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
    const c = document.createElement("canvas");
    c.width = Math.max(1, Math.round(img.naturalWidth * scale));
    c.height = Math.max(1, Math.round(img.naturalHeight * scale));
    const ctx = c.getContext("2d", { willReadFrequently: true })!;
    ctx.fillStyle = "#fff"; // PNG con transparencia previa → fondo blanco antes de procesar
    ctx.fillRect(0, 0, c.width, c.height);
    ctx.drawImage(img, 0, 0, c.width, c.height);
    return c;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * Quita el fondo claro y deja la tinta sólida: lo más claro que `threshold` queda
 * transparente; el resto se pinta casi negro y opaco, con borde suave solo en la orilla
 * del trazo. Así una foto con tinta gris o azul se ve nítida en Word.
 */
export function removeBackground(src: HTMLCanvasElement, threshold: number): HTMLCanvasElement {
  const out = document.createElement("canvas");
  out.width = src.width;
  out.height = src.height;
  const ctx = out.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0);
  const img = ctx.getImageData(0, 0, out.width, out.height);
  const d = img.data;
  const edge = 28; // ancho de la transición en niveles de gris
  for (let i = 0; i < d.length; i += 4) {
    const lum = 0.299 * d[i] + 0.587 * d[i + 1] + 0.114 * d[i + 2];
    const a = lum >= threshold ? 0 : Math.min(1, (threshold - lum) / edge);
    d[i] = 18;
    d[i + 1] = 18;
    d[i + 2] = 28;
    d[i + 3] = Math.round(a * 255);
  }
  ctx.putImageData(img, 0, 0);
  return out;
}

export function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result).split(",")[1] ?? "");
    r.onerror = () => reject(r.error);
    r.readAsDataURL(blob);
  });
}
