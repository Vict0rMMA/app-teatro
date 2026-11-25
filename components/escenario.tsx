"use client";

import { useEffect, useRef } from "react";

/** Medio ángulo del haz (grados). Debe coincidir con los conic-gradient de .foco-* en globals.css. */
const MEDIO_ANGULO = 17;
/** El polvo aparece cuando el foco ya encendió (ms). */
const INICIO_POLVO = 3400;

type Mota = { y: number; u: number; r: number; v: number; fase: number; a: number };

/**
 * Polvo flotando dentro del haz del foco. Canvas ligero (≤ 70 motas), solo dibuja; no toca el DOM.
 * Con prefers-reduced-motion no se anima. Se pausa solo cuando la pestaña no está visible (rAF).
 */
function Polvo() {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    if (!c || !ctx || matchMedia("(prefers-reduced-motion: reduce)").matches) return;

    const tan = Math.tan((MEDIO_ANGULO * Math.PI) / 180);
    let w = 0, h = 0, raf = 0, motas: Mota[] = [];

    const nueva = (enCualquierAltura: boolean): Mota => ({
      y: enCualquierAltura ? 40 + Math.random() * (h - 40) : h + Math.random() * 40,
      u: (Math.random() * 2 - 1) * 0.9,
      r: 0.5 + Math.random() * 1.3,
      v: 6 + Math.random() * 14, // px por segundo, subiendo
      fase: Math.random() * Math.PI * 2,
      a: 0.25 + Math.random() * 0.55,
    });

    const medir = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      w = c.clientWidth;
      h = c.clientHeight;
      c.width = Math.round(w * dpr);
      c.height = Math.round(h * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      const n = Math.max(22, Math.min(70, Math.round((w * h) / 16000)));
      motas = Array.from({ length: n }, () => nueva(true));
    };

    let antes = performance.now();
    const cuadro = (t: number) => {
      const dt = Math.min(0.05, (t - antes) / 1000);
      antes = t;
      ctx.clearRect(0, 0, w, h);
      ctx.fillStyle = "rgb(255 232 196)";
      for (const m of motas) {
        m.y -= m.v * dt;
        m.fase += dt * 0.6;
        m.u += Math.sin(m.fase) * dt * 0.04;
        if (m.y < 30 || Math.abs(m.u) > 1) Object.assign(m, nueva(false));
        const ancho = m.y * tan;
        const x = w / 2 + m.u * ancho;
        // Más brillo cerca del eje del haz y más abajo; se apaga al borde del cono.
        const alfa = m.a * Math.pow(1 - Math.abs(m.u), 1.4) * Math.min(1, m.y / (h * 0.35));
        if (alfa < 0.02) continue;
        ctx.globalAlpha = alfa;
        ctx.beginPath();
        ctx.arc(x, m.y, m.r, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
      raf = requestAnimationFrame(cuadro);
    };

    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(c);
    const arranque = window.setTimeout(() => {
      antes = performance.now();
      raf = requestAnimationFrame(cuadro);
    }, INICIO_POLVO);

    return () => {
      window.clearTimeout(arranque);
      cancelAnimationFrame(raf);
      ro.disconnect();
    };
  }, []);

  return <canvas ref={ref} className="escena-polvo" />;
}

/** Fondo del escenario: pared, piso, foco y polvo. Va detrás de la tarjeta. */
export function EscenarioFondo() {
  return (
    <div aria-hidden className="escenario z-0">
      <div className="escena-fondo" />
      <div className="foco foco-ancho" />
      <div className="foco foco-nucleo" />
      <div className="foco-piso" />
      <Polvo />
    </div>
  );
}

/** Telón y bambalina: van delante de la tarjeta y se abren al entrar. No reciben clics. */
export function EscenarioTelon() {
  return (
    <div aria-hidden className="escenario z-30">
      <div className="telon-hoja izq">
        <div className="telon-tela" />
      </div>
      <div className="telon-hoja der">
        <div className="telon-tela" />
      </div>
      <div className="telon-bambalina" />
    </div>
  );
}
