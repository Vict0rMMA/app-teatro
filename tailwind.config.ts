import type { Config } from "tailwindcss";

const v = (name: string) => `rgb(var(--${name}) / <alpha-value>)`;

export default {
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
        sans: ["var(--font-sans)", "system-ui", "sans-serif"],
        serif: ["var(--font-serif)", "Georgia", "serif"],
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
        "dialog-in": { from: { opacity: "0", transform: "translateY(4px) scale(0.99)" }, to: { opacity: "1", transform: "none" } },
      },
      animation: {
        "toast-in": "toast-in 160ms cubic-bezier(0.2, 0, 0, 1)",
        "dialog-in": "dialog-in 140ms cubic-bezier(0.2, 0, 0, 1)",
      },
    },
  },
  plugins: [],
} satisfies Config;
