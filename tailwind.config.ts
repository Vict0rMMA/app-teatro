import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
  future: { hoverOnlyWhenSupported: true },
  darkMode: "class",
  content: ["./app/**/*.{ts,tsx}", "./components/**/*.{ts,tsx}", "./lib/registros.ts"],
  theme: {
    extend: {
      colors: {
        bg: v("bg"),
        surface: v("surface"),
        subtle: v("subtle"),
        border: v("border"),
        fg: v("fg"),
        muted: v("muted"),
        faint: v("faint"),
        brand: { DEFAULT: v("brand"), fg: v("brand-fg"), soft: v("brand-soft"), hover: v("brand-hover") },
        ok: v("ok"),
        warn: v("warn"),
        danger: v("danger"),
      },
      fontFamily: {
        sans: ["Arial", "\"Helvetica Neue\"", "Helvetica", "sans-serif"],
        mono: ["ui-monospace", "SFMono-Regular", "Consolas", "monospace"],
      },
      borderRadius: {
        ctl: "6px", // inputs y botones
        box: "10px", // contenedores
      },
      boxShadow: {
        pop: "0 12px 32px -8px rgb(28 25 23 / 0.22), 0 2px 6px -2px rgb(28 25 23 / 0.10)",
      },
      keyframes: {
        "toast-in": { from: { opacity: "0", transform: "translateY(6px)" }, to: { opacity: "1", transform: "none" } },
        cargando: { "0%, 100%": { opacity: "1" }, "50%": { opacity: "0.55" } },
        puntos: { "0%, 80%, 100%": { opacity: "0.25" }, "40%": { opacity: "1" } },
        barra: { from: { transform: "translateX(-100%)" }, to: { transform: "translateX(300%)" } },
        "dialog-in": { from: { opacity: "0", transform: "translateY(4px) scale(0.99)" }, to: { opacity: "1", transform: "none" } },
        "aviso-luz": {
          "0%, 100%": { boxShadow: "0 0 0 0 rgb(var(--brand) / 0.12)", filter: "brightness(0.94)" },
          "50%": { boxShadow: "0 0 16px 4px rgb(var(--brand) / 0.42)", filter: "brightness(1.08)" },
        },
      },
      animation: {
        "toast-in": "toast-in 160ms cubic-bezier(0.2, 0, 0, 1)",
        cargando: "cargando 1.8s ease-in-out infinite",
        puntos: "puntos 1s ease-in-out infinite",
        barra: "barra 1.1s cubic-bezier(0.4, 0, 0.2, 1) infinite",
        "dialog-in": "dialog-in 140ms cubic-bezier(0.2, 0, 0, 1)",
        "aviso-luz": "aviso-luz 1.4s ease-in-out infinite",
      },
    },
  },
  plugins: [],
} satisfies Config;
