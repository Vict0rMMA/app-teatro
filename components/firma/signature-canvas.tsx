"use client";

import SignaturePad, { type PointGroup } from "signature_pad";
import { forwardRef, useEffect, useImperativeHandle, useRef } from "react";
import { trimAndScale } from "./image-tools";

export interface SignatureCanvasHandle {
  undo: () => void;
  clear: () => void;
  isEmpty: () => boolean;
  /** PNG transparente, recortado al contorno de la firma, máx. 800 px de ancho. */
  toPng: () => Promise<Blob | null>;
}

const PEN_COLOR = "#12121c";
/** Tras usar el lápiz, los toques con el dedo se ignoran este tiempo (rechazo de palma). */
const PALM_WINDOW_MS = 1500;

/**
 * Lienzo de firma sobre signature_pad (Pointer Events).
 * - touch-action: none, sin menú contextual ni zoom por doble toque.
 * - Lápiz (pointerType "pen") tiene prioridad sobre el dedo: se ignora la palma.
 * - Con lápiz, el grosor sigue la presión; con dedo o mouse, la velocidad.
 * - Escala con devicePixelRatio y se reajusta al girar o redimensionar sin perder el trazo.
 */
export const SignatureCanvas = forwardRef<SignatureCanvasHandle, { onChange?: (empty: boolean) => void; height?: number }>(
  function SignatureCanvas({ onChange, height = 200 }, ref) {
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const padRef = useRef<SignaturePad | null>(null);
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    useEffect(() => {
      const canvas = canvasRef.current!;
      const pad = new SignaturePad(canvas, {
        penColor: PEN_COLOR,
        backgroundColor: "rgba(0,0,0,0)",
        minWidth: 1.1,
        maxWidth: 3.4,
        velocityFilterWeight: 0.7,
        minDistance: 2,
        throttle: 8,
      });
      padRef.current = pad;

      let penStroke = false;
      let lastPenAt = 0;
      let penDown = false;

      // Grosor: con lápiz mezcla presión y velocidad; si no, solo velocidad (comportamiento original).
      type Pt = { pressure: number; velocityFrom: (p: Pt) => number };
      type Opts = { minWidth: number; maxWidth: number; velocityFilterWeight: number };
      const internal = pad as unknown as {
        _lastVelocity: number;
        _lastWidth: number;
        _drawingStroke: boolean;
        _calculateCurveWidths: (a: Pt, b: Pt, o: Opts) => { start: number; end: number };
      };
      internal._calculateCurveWidths = function (start: Pt, end: Pt, o: Opts) {
        const velocity = o.velocityFilterWeight * end.velocityFrom(start) + (1 - o.velocityFilterWeight) * internal._lastVelocity;
        const byVelocity = Math.max(o.maxWidth / (velocity + 1), o.minWidth);
        const usePressure = internal._drawingStroke ? penStroke : end.pressure > 0;
        const p = Math.min(1, Math.max(0, end.pressure));
        const width = usePressure ? 0.75 * (o.minWidth + (o.maxWidth * 1.15 - o.minWidth) * p) + 0.25 * byVelocity : byVelocity;
        const widths = { start: internal._lastWidth, end: width };
        internal._lastVelocity = velocity;
        internal._lastWidth = width;
        return widths;
      };

      const onBegin = (e: Event) => {
        const ev = (e as CustomEvent<{ event?: PointerEvent }>).detail?.event;
        const type = ev?.pointerType;
        if (type === "pen") {
          penDown = true;
          lastPenAt = Date.now();
        }
        // Rechazo de palma: si el lápiz está en uso, el dedo no dibuja.
        if (type === "touch" && (penDown || Date.now() - lastPenAt < PALM_WINDOW_MS)) {
          e.preventDefault();
          return;
        }
        penStroke = type === "pen";
      };
      const onEnd = () => {
        if (penStroke) lastPenAt = Date.now();
        penDown = false;
        // Los trazos sin lápiz guardan presión 0 para que al redibujar usen la velocidad.
        if (!penStroke) {
          const data = pad.toData();
          data[data.length - 1]?.points.forEach((pt) => (pt.pressure = 0));
        }
        onChangeRef.current?.(pad.isEmpty());
      };
      pad.addEventListener("beginStroke", onBegin);
      pad.addEventListener("endStroke", onEnd);

      // Ajuste a devicePixelRatio conservando el trazo (se escala al nuevo ancho).
      let lastWidth = 0;
      const resize = () => {
        const rect = canvas.getBoundingClientRect();
        if (!rect.width) return;
        const ratio = Math.max(window.devicePixelRatio || 1, 1);
        const data = pad.toData();
        const scale = lastWidth ? rect.width / lastWidth : 1;
        canvas.width = Math.round(rect.width * ratio);
        canvas.height = Math.round(rect.height * ratio);
        canvas.getContext("2d")!.scale(ratio, ratio);
        pad.clear();
        if (data.length) {
          const scaled: PointGroup[] = data.map((g) => ({
            ...g,
            points: g.points.map((pt) => ({ ...pt, x: pt.x * scale, y: pt.y * scale })),
          }));
          pad.fromData(scaled);
        }
        lastWidth = rect.width;
      };
      resize();
      const ro = new ResizeObserver(() => resize());
      ro.observe(canvas);
      window.addEventListener("orientationchange", resize);

      // Sin menú contextual (pulsación larga) ni gestos del navegador sobre el lienzo.
      const block = (e: Event) => e.preventDefault();
      canvas.addEventListener("contextmenu", block);
      canvas.addEventListener("dblclick", block);
      canvas.addEventListener("gesturestart", block);
      canvas.addEventListener("selectstart", block);

      return () => {
        ro.disconnect();
        window.removeEventListener("orientationchange", resize);
        canvas.removeEventListener("contextmenu", block);
        canvas.removeEventListener("dblclick", block);
        canvas.removeEventListener("gesturestart", block);
        canvas.removeEventListener("selectstart", block);
        pad.removeEventListener("beginStroke", onBegin);
        pad.removeEventListener("endStroke", onEnd);
        pad.off();
        padRef.current = null;
      };
    }, []);

    useImperativeHandle(ref, () => ({
      undo() {
        const pad = padRef.current;
        if (!pad) return;
        const data = pad.toData();
        data.pop();
        pad.clear();
        pad.fromData(data);
        onChangeRef.current?.(pad.isEmpty());
      },
      clear() {
        padRef.current?.clear();
        onChangeRef.current?.(true);
      },
      isEmpty: () => padRef.current?.isEmpty() ?? true,
      async toPng() {
        const pad = padRef.current;
        if (!pad || pad.isEmpty()) return null;
        return trimAndScale(canvasRef.current!, 800);
      },
    }));

    return (
      <div className="relative overflow-hidden rounded-box border border-border bg-white">
        <canvas
          ref={canvasRef}
          className="block w-full cursor-crosshair select-none"
          style={{ height, touchAction: "none", WebkitUserSelect: "none", WebkitTouchCallout: "none", userSelect: "none" } as React.CSSProperties}
          aria-label="Lienzo para dibujar la firma"
        />
        <div className="pointer-events-none absolute inset-x-6 bottom-9 border-b border-dashed border-stone-300" />
        <span className="pointer-events-none absolute bottom-3 left-6 text-[11px] text-stone-400">Firma aquí</span>
      </div>
    );
  },
);
