"use client";

import { useEffect, useState } from "react";
import { IconMoon, IconSun } from "./icons";

/** Se ejecuta antes de pintar para evitar el parpadeo de tema. */
export const themeScript = `(function(){try{var t=localStorage.getItem('theme');var d=t?t==='dark':matchMedia('(prefers-color-scheme: dark)').matches;document.documentElement.classList.toggle('dark',d);}catch(e){}})();`;

export function ThemeToggle({ className }: { className?: string }) {
  const [dark, setDark] = useState<boolean | null>(null);
  useEffect(() => setDark(document.documentElement.classList.contains("dark")), []);

  function toggle() {
    const next = !document.documentElement.classList.contains("dark");
    document.documentElement.classList.toggle("dark", next);
    localStorage.setItem("theme", next ? "dark" : "light");
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", next ? "#0a0a0b" : "#fafafa");
    setDark(next);
  }

  return (
    <button
      onClick={toggle}
      aria-label={dark ? "Cambiar a modo claro" : "Cambiar a modo oscuro"}
      className={className ?? "grid h-8 w-8 place-items-center rounded-md text-muted hover:bg-subtle hover:text-fg"}
    >
      {dark ? <IconSun /> : <IconMoon />}
    </button>
  );
}
