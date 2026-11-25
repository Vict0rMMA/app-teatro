"use client";

import {
  forwardRef,
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from "react";
import { IconX } from "./icons";

export function cx(...parts: Array<string | false | null | undefined>) {
  return parts.filter(Boolean).join(" ");
}

type Variant = "primary" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const variants: Record<Variant, string> = {
  primary: "bg-brand text-brand-fg hover:bg-brand-hover",
  secondary: "border border-border bg-transparent text-fg hover:border-fg/30 hover:bg-surface",
  ghost: "text-muted hover:bg-subtle hover:text-fg",
  danger: "bg-danger text-white hover:bg-danger/90",
};

const sizes: Record<Size, string> = {
  sm: "h-8 px-2.5 text-[13px]",
  md: "h-10 px-3.5 text-sm sm:h-9",
  lg: "h-11 px-5 text-[15px]",
};

export const Button = forwardRef<
  HTMLButtonElement,
  ButtonHTMLAttributes<HTMLButtonElement> & { variant?: Variant; size?: Size; loading?: boolean; icon?: ReactNode }
>(function Button({ variant = "secondary", size = "md", loading, icon, className, children, disabled, ...rest }, ref) {
  return (
    <button
      ref={ref}
      disabled={disabled || loading}
      className={cx(
        "inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-ctl font-medium",
        "transition-[background-color,border-color,color,transform] duration-100 active:translate-y-px",
        "disabled:cursor-not-allowed disabled:opacity-50",
        sizes[size],
        variants[variant],
        className,
      )}
      {...rest}
    >
      {loading ? <Spinner /> : icon}
      {children}
    </button>
  );
});

export function Spinner({ className }: { className?: string }) {
  return (
    <svg className={cx("h-4 w-4 animate-spin", className)} viewBox="0 0 24 24" fill="none" aria-hidden>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.2" strokeWidth="2" />
      <path d="M21 12a9 9 0 0 0-9-9" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  );
}

const field =
  "w-full rounded-ctl border border-border bg-surface px-3 text-fg placeholder:text-faint transition-colors duration-100 hover:border-fg/25 focus:border-brand/60 focus:outline-none focus:ring-2 focus:ring-brand/20 disabled:opacity-60";

export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(function Input({ className, ...rest }, ref) {
  return <input ref={ref} className={cx(field, "h-10 sm:h-9", className)} {...rest} />;
});

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(function Textarea(
  { className, ...rest },
  ref,
) {
  return <textarea ref={ref} className={cx(field, "min-h-[72px] py-2 leading-relaxed", className)} {...rest} />;
});

export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(function Select(
  { className, children, ...rest },
  ref,
) {
  return (
    <select
      ref={ref}
      className={cx(field, "h-10 appearance-none bg-no-repeat pr-8 sm:h-9", className)}
      style={{
        backgroundImage:
          "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='14' height='14' viewBox='0 0 24 24' fill='none' stroke='%23857c72' stroke-width='1.5'%3E%3Cpath d='m7 10 5 5 5-5'/%3E%3C/svg%3E\")",
        backgroundPosition: "right 10px center",
      }}
      {...rest}
    >
      {children}
    </select>
  );
});

export function Field({
  label,
  hint,
  error,
  children,
  className,
}: {
  label: string;
  hint?: ReactNode;
  error?: string | null;
  children: (id: string) => ReactNode;
  className?: string;
}) {
  const id = useId();
  return (
    <div className={cx("space-y-1.5", className)}>
      <label htmlFor={id} className="block text-[12px] font-medium uppercase tracking-[0.05em] text-muted">
        {label}
      </label>
      {children(id)}
      {error ? <p className="text-xs text-danger">{error}</p> : hint ? <p className="text-xs text-muted">{hint}</p> : null}
    </div>
  );
}

/** Solo para bloques interactivos (editores, tablas). El resto de la página va sin caja. */
export function Card({ className, children }: { className?: string; children: ReactNode }) {
  return <div className={cx("rounded-box border border-border bg-surface", className)}>{children}</div>;
}

/** Encabezado de bloque, sin línea inferior. `serif` para títulos de primer nivel dentro de la página. */
export function CardHeader({
  title,
  description,
  action,
  serif,
}: {
  title: string;
  description?: ReactNode;
  action?: ReactNode;
  serif?: boolean;
}) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 pb-1 pt-4 sm:px-5">
      <div className="min-w-0">
        <h2 className={serif ? "font-serif text-lg font-medium" : "eyebrow text-fg"}>{title}</h2>
        {description && <p className="mt-1 max-w-prose text-[13px] text-muted">{description}</p>}
      </div>
      {action}
    </div>
  );
}

/** Sección de página: separada por espacio y una línea fina, sin caja. */
export function Section({
  title,
  description,
  action,
  children,
  className,
  first,
}: {
  title: ReactNode;
  description?: ReactNode;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  first?: boolean;
}) {
  return (
    <section className={cx(!first && "border-t border-border pt-6", "pb-8", className)}>
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div className="min-w-0">
          <h2 className="font-serif text-xl font-medium leading-tight">{title}</h2>
          {description && <p className="mt-1 max-w-prose text-[13px] text-muted">{description}</p>}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

type Tone = "neutral" | "brand" | "ok" | "warn" | "danger";
const dot: Record<Tone, string> = { neutral: "bg-faint", brand: "bg-brand", ok: "bg-ok", warn: "bg-warn", danger: "bg-danger" };
const toneText: Record<Tone, string> = { neutral: "text-muted", brand: "text-fg", ok: "text-ok", warn: "text-warn", danger: "text-danger" };

/** Estado como texto con punto de color (no pastilla). */
export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: Tone }) {
  return (
    <span className={cx("inline-flex items-center gap-1.5 whitespace-nowrap text-[12px]", toneText[tone])}>
      <span aria-hidden className={cx("h-1.5 w-1.5 shrink-0 rounded-full", dot[tone])} />
      {children}
    </span>
  );
}

/** Estado vacío: título, una línea y la acción. Sin icono. */
export function EmptyState({ title, description, action }: { icon?: ReactNode; title: string; description: string; action?: ReactNode }) {
  return (
    <div className="px-6 py-12 text-center">
      <p className="font-serif text-lg">{title}</p>
      <p className="mx-auto mt-1 max-w-sm text-[13px] text-muted">{description}</p>
      {action && <div className="mt-5">{action}</div>}
    </div>
  );
}

/** Aviso con filete lateral; para advertencias que no bloquean. */
export function Notice({ tone = "warn", children, className }: { tone?: "warn" | "danger" | "ok"; children: ReactNode; className?: string }) {
  const border = { warn: "border-warn", danger: "border-danger", ok: "border-ok" }[tone];
  return <div className={cx("border-l-2 py-1 pl-4 text-[13px] leading-relaxed", border, className)}>{children}</div>;
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("animate-pulse rounded-ctl bg-subtle", className)} />;
}

export function PageHeader({
  title,
  description,
  action,
  eyebrow,
}: {
  title: ReactNode;
  /** línea de contexto concreta: fecha, conteo del mes… */
  description?: ReactNode;
  action?: ReactNode;
  eyebrow?: ReactNode;
}) {
  return (
    <header className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
      <div className="min-w-0">
        {eyebrow && <p className="eyebrow mb-2">{eyebrow}</p>}
        <h1 className="font-serif text-[28px] font-medium leading-[1.1] tracking-[-0.01em] sm:text-[32px]">{title}</h1>
        {description && <p className="mt-2 text-sm text-muted">{description}</p>}
      </div>
      {action && <div className="flex shrink-0 flex-wrap gap-2">{action}</div>}
    </header>
  );
}

export function Modal({
  open,
  onClose,
  title,
  children,
  footer,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);
  return (
    <dialog
      ref={ref}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
      className={cx(
        "m-auto w-[calc(100%-24px)] rounded-box border border-border bg-surface p-0 text-fg shadow-pop backdrop:bg-[#1C1917]/45",
        "open:animate-dialog-in",
        wide ? "max-w-5xl" : "max-w-md",
      )}
    >
      {open && (
        <div className="flex max-h-[85dvh] flex-col">
          <div className="flex items-center justify-between px-5 pb-2 pt-4">
            <h2 className="font-serif text-lg font-medium">{title}</h2>
            <button onClick={onClose} className="grid h-8 w-8 place-items-center rounded-ctl text-muted hover:bg-subtle hover:text-fg" aria-label="Cerrar">
              <IconX />
            </button>
          </div>
          <div className="overflow-y-auto px-5 py-3">{children}</div>
          {footer && <div className="flex justify-end gap-2 border-t border-border px-5 py-3">{footer}</div>}
        </div>
      )}
    </dialog>
  );
}

/** Cifra destacada sin caja: etiqueta pequeña y número en serif. */
export function Stat({ label, value, sub, className }: { label: string; value: ReactNode; sub?: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <p className="eyebrow">{label}</p>
      <p className="tabular mt-1 font-serif text-[26px] leading-tight">{value}</p>
      {sub && <p className="mt-0.5 text-xs text-muted">{sub}</p>}
    </div>
  );
}

/** Fila de cifras separadas por filetes verticales. */
export function StatRow({ children, className }: { children: ReactNode; className?: string }) {
  return (
    <div className={cx("grid grid-cols-2 gap-y-5 border-y border-border py-5 lg:grid-flow-col lg:grid-cols-none lg:divide-x lg:divide-border [&>*]:px-0 lg:[&>*]:px-6 lg:[&>*:first-child]:pl-0", className)}>
      {children}
    </div>
  );
}
