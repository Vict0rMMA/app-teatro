"use client";

import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import { IconX } from "./icons";
import { cx } from "./ui";

type Tone = "success" | "error" | "info" | "warn";
interface Toast {
  id: number;
  tone: Tone;
  title: string;
  description?: string;
}

interface ToastApi {
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  warn: (title: string, description?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const next = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (tone: Tone, title: string, description?: string) => {
      const id = next.current++;
      setToasts((t) => [...t.slice(-3), { id, tone, title, description }]);
      setTimeout(() => dismiss(id), tone === "error" || tone === "warn" ? 7000 : 4000);
    },
    [dismiss],
  );

  const api = useMemo<ToastApi>(
    () => ({
      success: (t, d) => push("success", t, d),
      error: (t, d) => push("error", t, d),
      info: (t, d) => push("info", t, d),
      warn: (t, d) => push("warn", t, d),
    }),
    [push],
  );

  return (
    <Ctx.Provider value={api}>
      {children}
      <div
        aria-live="polite"
        className="pointer-events-none fixed inset-x-0 bottom-[calc(76px+env(safe-area-inset-bottom))] z-[60] flex flex-col items-center gap-2 px-3 sm:bottom-4 sm:right-4 sm:left-auto sm:items-end"
      >
        {toasts.map((t) => (
          <div
            key={t.id}
            role={t.tone === "error" ? "alert" : "status"}
            className="pointer-events-auto flex w-full max-w-sm animate-toast-in items-start gap-3 rounded-box border border-border bg-surface px-3.5 py-3 shadow-pop"
          >
            <span
              aria-hidden
              className={cx(
                "mt-[7px] h-1.5 w-1.5 shrink-0 rounded-full",
                t.tone === "success" && "bg-ok",
                t.tone === "error" && "bg-danger",
                t.tone === "warn" && "bg-warn",
                t.tone === "info" && "bg-muted",
              )}
            />
            <div className="min-w-0 flex-1">
              <p className="text-[13px] font-medium">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-muted">{t.description}</p>}
            </div>
            <button onClick={() => dismiss(t.id)} className="text-faint hover:text-fg" aria-label="Cerrar">
              <IconX width={14} height={14} />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useToast fuera de ToastProvider");
  return ctx;
}
