"use client";

import {
  Component,
  useEffect,
  useId,
  useRef,
  useState,
  type ErrorInfo,
  type ReactNode,
  type ButtonHTMLAttributes,
  type InputHTMLAttributes,
  type TextareaHTMLAttributes,
  type SelectHTMLAttributes,
} from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence, useReducedMotion } from "framer-motion";
import {
  X,
  AlertTriangle,
  CheckCircle2,
  Info,
  Loader2,
  Inbox,
  RotateCcw,
  Home,
} from "lucide-react";
import { cx } from "../lib/utils";
import { useToasts, usePrefs, useNav, useShallow } from "../lib/store";
import { BrandMark } from "./brand";

/* ═══════════════════════════════════════════════════
   Button — refined with warmer tones, better depth
   ═══════════════════════════════════════════════════ */

type BtnVariant = "gold" | "outline" | "ghost" | "danger" | "subtle";
interface BtnProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: BtnVariant;
  size?: "xs" | "sm" | "md" | "lg";
  loading?: boolean;
}

export function Button({
  variant = "outline",
  size = "md",
  loading,
  className,
  children,
  disabled,
  ...rest
}: BtnProps) {
  const v: Record<BtnVariant, string> = {
    gold: "bg-gold-500 text-(--acc-ink) border border-gold-400/50 hover:bg-gold-400 active:bg-gold-600 shadow-[0_4px_20px_-6px_var(--acc-glow),0_1px_0_0_rgb(255_255_255/0.2)_inset] font-semibold",
    outline:
      "border border-ink-600 text-mist-200 hover:border-gold-600 hover:text-gold-300 bg-ink-850/60 hover:bg-ink-800/80",
    ghost: "text-mist-300 hover:text-gold-300 hover:bg-ink-750/80",
    danger:
      "border border-danger-500/50 text-danger-400 hover:bg-danger-500/10 hover:border-danger-500/70",
    subtle:
      "bg-ink-750 text-mist-200 hover:bg-ink-700 border border-ink-600/50",
  };
  const s = {
    xs: "text-xs px-2.5 py-1.5",
    sm: "text-xs px-3 py-2",
    md: "text-sm px-4 py-2.5",
    lg: "text-[15px] px-6 py-3",
  }[size];
  return (
    <button
      className={cx(
        "inline-flex items-center justify-center gap-2 rounded-lg font-display tracking-wide transition-all duration-200 select-none disabled:opacity-45 disabled:pointer-events-none whitespace-nowrap press",
        v[variant],
        s,
        className,
      )}
      disabled={disabled || loading}
      {...rest}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" aria-hidden />}
      {children}
    </button>
  );
}

export function IconBtn({
  label,
  className,
  children,
  active,
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  label: string;
  active?: boolean;
}) {
  return (
    <button
      aria-label={label}
      title={label}
      className={cx(
        "inline-flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-150",
        active
          ? "bg-gold-500/15 text-gold-300 border border-gold-700/50"
          : "text-mist-400 hover:text-gold-300 hover:bg-ink-750/80 border border-transparent",
        className,
      )}
      {...rest}
    >
      {children}
    </button>
  );
}

/* ═══════════════════════════════════════════════════
   Surfaces
   ═══════════════════════════════════════════════════ */

export function Panel({
  className,
  children,
}: {
  className?: string;
  children: ReactNode;
}) {
  return <div className={cx("panel", className)}>{children}</div>;
}

export function Badge({
  className,
  children,
  tone = "muted",
  title,
}: {
  className?: string;
  children: ReactNode;
  tone?: "muted" | "gold" | "ok" | "danger" | "ouro" | "ankaa";
  title?: string;
}) {
  const t = {
    muted: "bg-ink-750 text-mist-400 border-ink-600/60",
    gold: "bg-gold-500/10 text-gold-300 border-gold-700/50",
    ok: "bg-ok-500/10 text-ok-400 border-ok-500/30",
    danger: "bg-danger-500/10 text-danger-400 border-danger-500/30",
    ouro: "bg-ouro-500/10 text-ouro-300 border-ouro-500/30",
    ankaa: "bg-ankaa-500/10 text-ankaa-300 border-ankaa-500/30",
  }[tone];
  return (
    <span
      title={title}
      className={cx(
        "inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[10px] font-display uppercase tracking-[0.12em]",
        t,
        className,
      )}
    >
      {children}
    </span>
  );
}

export function Progress({
  value,
  className,
  tone = "gold",
}: {
  value: number;
  className?: string;
  tone?: "gold" | "ouro" | "ok";
}) {
  const c = { gold: "bg-gold-500", ouro: "bg-ouro-500", ok: "bg-ok-500" }[tone];
  return (
    <div
      className={cx(
        "h-1.5 w-full rounded-full bg-ink-700 overflow-hidden",
        className,
      )}
      role="progressbar"
      aria-valuenow={Math.round(value)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <div
        className={cx(
          "h-full rounded-full transition-[width] duration-500 ease-out",
          c,
        )}
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export function Skeleton({ className }: { className?: string }) {
  return <div className={cx("skeleton", className)} aria-hidden />;
}

/** Circular progress — the house way of showing "how far through a book". */
export function ProgressRing({
  value,
  size = 56,
  stroke = 4,
  label,
  tone = "gold",
}: {
  value: number;
  size?: number;
  stroke?: number;
  label?: ReactNode;
  tone?: "gold" | "ok" | "ouro";
}) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const v = Math.min(100, Math.max(0, value));
  const color =
    tone === "ok"
      ? "var(--color-ok-500)"
      : tone === "ouro"
        ? "var(--color-ouro-500)"
        : "var(--acc)";
  return (
    <div
      className="relative inline-flex items-center justify-center shrink-0"
      style={{ width: size, height: size }}
      role="progressbar"
      aria-valuenow={Math.round(v)}
      aria-valuemin={0}
      aria-valuemax={100}
    >
      <svg width={size} height={size} className="-rotate-90" aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-ink-700)"
          strokeWidth={stroke}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
          strokeDasharray={c}
          strokeDashoffset={c - (v / 100) * c}
          style={{
            transition: "stroke-dashoffset 0.8s cubic-bezier(0.22,1,0.36,1)",
            filter: `drop-shadow(0 0 6px ${color})`,
          }}
        />
      </svg>
      <span
        className="absolute inset-0 flex items-center justify-center font-display tabular-nums text-mist-100"
        style={{ fontSize: size * 0.24 }}
      >
        {label ?? `${Math.round(v)}%`}
      </span>
    </div>
  );
}

/** Small-caps eyebrow label — the recurring section voice. */
export function Eyebrow({
  children,
  className,
}: {
  children: ReactNode;
  className?: string;
}) {
  return (
    <p
      className={cx(
        "flex items-center gap-2.5 text-[11px] font-display uppercase tracking-[0.26em] text-gold-400",
        className,
      )}
    >
      <BrandMark
        size={20}
        className="text-gold-600 shrink-0"
        strokeWidth={3.4}
      />
      {children}
    </p>
  );
}

/** Section heading: eyebrow + large display title + optional aside. */
export function SectionHead({
  eyebrow,
  title,
  aside,
  className,
}: {
  eyebrow: string;
  title: ReactNode;
  aside?: ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cx(
        "flex flex-wrap items-end justify-between gap-4 mb-6",
        className,
      )}
    >
      <div>
        <Eyebrow className="mb-2.5">{eyebrow}</Eyebrow>
        <h2 className="font-display font-semibold text-2xl sm:text-[1.8rem] leading-tight text-mist-100">
          {title}
        </h2>
      </div>
      {aside}
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Controls
   ═══════════════════════════════════════════════════ */

export function Toggle({
  checked,
  onChange,
  label,
  hint,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  hint?: string;
}) {
  return (
    <label className="flex items-center justify-between gap-4 cursor-pointer group py-1">
      <span>
        <span className="block text-sm text-mist-200 group-hover:text-mist-100 transition-colors">
          {label}
        </span>
        {hint && (
          <span className="block text-xs text-mist-500 mt-0.5">{hint}</span>
        )}
      </span>
      <button
        role="switch"
        aria-checked={checked}
        aria-label={label}
        onClick={(e) => {
          e.preventDefault();
          onChange(!checked);
        }}
        className={cx(
          "relative w-11 h-6 rounded-full border transition-all duration-200 shrink-0",
          checked
            ? "bg-gold-500/90 border-gold-400 shadow-[0_0_12px_var(--acc-glow)]"
            : "bg-ink-750 border-ink-600",
        )}
      >
        <span
          className={cx(
            "absolute top-0.5 w-5 h-5 rounded-full bg-mist-100 shadow-md transition-all duration-200",
            checked ? "left-5.5" : "left-0.75",
          )}
        />
      </button>
    </label>
  );
}

export function Slider({
  label,
  value,
  min,
  max,
  step,
  unit,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  unit?: string;
  onChange: (v: number) => void;
}) {
  return (
    <div className="py-1.5">
      <div className="flex items-center justify-between mb-1.5">
        <span className="text-sm text-mist-200">{label}</span>
        <span className="text-xs font-display text-gold-300 tabular-nums">
          {value}
          {unit}
        </span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-label={label}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full"
      />
    </div>
  );
}

export function Select({
  label,
  className,
  children,
  ...rest
}: SelectHTMLAttributes<HTMLSelectElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-display uppercase tracking-widest text-mist-500 mb-1.5">
          {label}
        </span>
      )}
      <select
        className={cx(
          "w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2.5 text-sm text-mist-200 hover:border-gold-700 focus:border-gold-600 outline-none transition-colors",
          className,
        )}
        {...rest}
      >
        {children}
      </select>
    </label>
  );
}

export function Input({
  label,
  className,
  ...rest
}: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-display uppercase tracking-widest text-mist-500 mb-1.5">
          {label}
        </span>
      )}
      <input
        className={cx(
          "w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-600 hover:border-gold-800 focus:border-gold-600 outline-none transition-colors",
          className,
        )}
        {...rest}
      />
    </label>
  );
}

export function Textarea({
  label,
  className,
  ...rest
}: TextareaHTMLAttributes<HTMLTextAreaElement> & { label?: string }) {
  return (
    <label className="block">
      {label && (
        <span className="block text-xs font-display uppercase tracking-widest text-mist-500 mb-1.5">
          {label}
        </span>
      )}
      <textarea
        className={cx(
          "w-full rounded-lg border border-ink-600 bg-ink-850 px-3 py-2.5 text-sm text-mist-100 placeholder:text-mist-600 hover:border-gold-800 focus:border-gold-600 outline-none transition-colors resize-y",
          className,
        )}
        {...rest}
      />
    </label>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: ReactNode; title?: string }[];
  value: T;
  onChange: (v: T) => void;
  ariaLabel: string;
}) {
  return (
    <div
      role="tablist"
      aria-label={ariaLabel}
      className="inline-flex rounded-lg border border-ink-600 bg-ink-875 p-0.5 gap-0.5"
    >
      {options.map((o) => (
        <button
          key={o.value}
          role="tab"
          title={o.title}
          aria-selected={value === o.value}
          onClick={() => onChange(o.value)}
          className={cx(
            "px-3 py-1.5 rounded-md text-xs font-display tracking-wide transition-all",
            value === o.value
              ? "bg-gold-500/15 text-gold-300 border border-gold-700/50"
              : "text-mist-400 hover:text-mist-200 border border-transparent",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

export function Tabs({
  tabs,
  value,
  onChange,
}: {
  tabs: { id: string; label: ReactNode; icon?: ReactNode }[];
  value: string;
  onChange: (id: string) => void;
}) {
  const lineId = useId();
  return (
    <div
      role="tablist"
      className="flex gap-1 border-b border-ink-700 overflow-x-auto scrollbar-thin"
    >
      {tabs.map((t) => (
        <button
          key={t.id}
          role="tab"
          aria-selected={value === t.id}
          onClick={() => onChange(t.id)}
          className={cx(
            "relative px-3.5 py-2.5 text-xs font-display uppercase tracking-widest transition-colors whitespace-nowrap inline-flex items-center gap-1.5",
            value === t.id
              ? "text-gold-300"
              : "text-mist-500 hover:text-mist-300",
          )}
        >
          {t.icon}
          {t.label}
          {value === t.id && (
            <motion.span
              layoutId={`tabline-${lineId}`}
              className="absolute left-2 right-2 -bottom-px h-0.5 bg-gold-500 rounded-full"
            />
          )}
        </button>
      ))}
    </div>
  );
}

export function Menu({
  button,
  items,
  align = "right",
}: {
  button: ReactNode;
  items: {
    label: string;
    icon?: ReactNode;
    danger?: boolean;
    onClick: () => void;
  }[];
  align?: "left" | "right";
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node))
        setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);
  return (
    <div ref={ref} className="relative">
      <div
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
      >
        {button}
      </div>
      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.96 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.96 }}
            transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              "absolute z-50 mt-1.5 min-w-48 rounded-xl border border-ink-600 bg-ink-800/95 backdrop-blur-xl shadow-float overflow-hidden p-1",
              align === "right" ? "right-0" : "left-0",
            )}
            role="menu"
          >
            {items.map((it) => (
              <button
                key={it.label}
                role="menuitem"
                onClick={(e) => {
                  e.stopPropagation();
                  setOpen(false);
                  it.onClick();
                }}
                className={cx(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-left text-sm rounded-lg transition-colors",
                  it.danger
                    ? "text-danger-400 hover:bg-danger-500/10"
                    : "text-mist-300 hover:bg-ink-750 hover:text-gold-300",
                )}
              >
                {it.icon}
                {it.label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

/* ═══════════════════════════════════════════════════
   Overlays
   ═══════════════════════════════════════════════════ */

export function Dialog({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean;
  onClose: () => void;
  title: ReactNode;
  children: ReactNode;
  wide?: boolean;
}) {
  const reduce = useReducedMotion();
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    // focus the panel itself so screen readers land on the dialog and the
    // first Tab moves to the first interactive child rather than the page
    // behind the overlay.
    requestAnimationFrame(() => panelRef.current?.focus?.());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // restore focus to whatever opened the dialog (WCAG 2.4.3)
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-80 flex items-center justify-center p-4 sm:p-6"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
        >
          <div
            className="absolute inset-0 bg-ink-950/80 backdrop-blur-md"
            onClick={onClose}
          />
          <motion.div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={
              reduce ? { opacity: 0 } : { opacity: 0, y: 20, scale: 0.96 }
            }
            animate={reduce ? { opacity: 1 } : { opacity: 1, y: 0, scale: 1 }}
            exit={reduce ? { opacity: 0 } : { opacity: 0, y: 12, scale: 0.97 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              "relative panel-glass rounded-2xl w-full max-h-[88vh] overflow-y-auto p-5 sm:p-6 shadow-float",
              wide ? "max-w-2xl" : "max-w-md",
            )}
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="flex items-start justify-between gap-4 mb-4">
              <h2 id={titleId} className="font-display text-lg text-mist-100">
                {title}
              </h2>
              <IconBtn label="Close dialog" onClick={onClose}>
                <X className="w-4 h-4" />
              </IconBtn>
            </div>
            {children}
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

export function Sheet({
  open,
  onClose,
  side = "right",
  title,
  children,
  width = "max-w-md",
}: {
  open: boolean;
  onClose: () => void;
  side?: "left" | "right";
  title: ReactNode;
  children: ReactNode;
  width?: string;
}) {
  const titleId = useId();
  const panelRef = useRef<HTMLElement | null>(null);
  const previouslyFocused = useRef<HTMLElement | null>(null);
  useEffect(() => {
    if (!open) return;
    previouslyFocused.current = document.activeElement as HTMLElement | null;
    requestAnimationFrame(() => panelRef.current?.focus?.());
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "Tab" && panelRef.current) {
        const focusable = panelRef.current.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        );
        if (focusable.length === 0) {
          e.preventDefault();
          return;
        }
        const first = focusable[0];
        const last = focusable[focusable.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    };
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      previouslyFocused.current?.focus?.();
      previouslyFocused.current = null;
    };
  }, [open, onClose]);
  return createPortal(
    <AnimatePresence>
      {open && (
        <div className="fixed inset-0 z-70">
          <motion.div
            className="absolute inset-0 bg-ink-950/70 backdrop-blur-sm"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
          />
          <motion.aside
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            initial={{ x: side === "right" ? "100%" : "-100%" }}
            animate={{ x: 0 }}
            exit={{ x: side === "right" ? "100%" : "-100%" }}
            transition={{
              type: "tween",
              duration: 0.32,
              ease: [0.22, 1, 0.36, 1],
            }}
            className={cx(
              "absolute top-0 bottom-0 w-full bg-ink-875/95 backdrop-blur-xl border-l border-ink-700 shadow-float flex flex-col safe-top safe-bottom",
              width,
              side === "right" ? "right-0 border-l" : "left-0 border-r",
            )}
            ref={panelRef}
            tabIndex={-1}
          >
            <div className="flex items-center justify-between px-5 py-4 border-b border-ink-700 shrink-0">
              <h2
                id={titleId}
                className="font-display text-sm uppercase tracking-[0.14em] text-gold-300"
              >
                {title}
              </h2>
              <IconBtn label="Close panel" onClick={onClose}>
                <X className="w-4 h-4" />
              </IconBtn>
            </div>
            <div className="flex-1 overflow-y-auto">{children}</div>
          </motion.aside>
        </div>
      )}
    </AnimatePresence>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════
   Feedback
   ═══════════════════════════════════════════════════ */

export function EmptyState({
  icon,
  title,
  body,
  action,
}: {
  icon?: ReactNode;
  title: string;
  body: string;
  action?: ReactNode;
}) {
  return (
    <div className="flex flex-col items-center justify-center text-center py-16 px-6">
      <div className="w-16 h-16 rounded-2xl border border-ink-600 bg-ink-850 flex items-center justify-center text-mist-500 mb-5 shadow-card">
        {icon ?? <Inbox className="w-7 h-7" />}
      </div>
      <h3 className="font-display text-lg text-mist-200 mb-2">{title}</h3>
      <p className="text-sm text-mist-500 max-w-sm leading-relaxed mb-6">
        {body}
      </p>
      {action}
    </div>
  );
}

export function ToastHost() {
  const { list, dismiss } = useToasts(
    useShallow((s) => ({ list: s.list, dismiss: s.dismiss })),
  );
  return createPortal(
    <div
      className="fixed bottom-5 right-5 z-95 flex flex-col gap-2.5 w-[min(92vw,380px)] safe-bottom"
      role="status"
      aria-live="polite"
    >
      <AnimatePresence>
        {list.map((t) => (
          <motion.div
            key={t.id}
            initial={{ opacity: 0, x: 40, scale: 0.95 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 40, scale: 0.95 }}
            transition={{ duration: 0.24, ease: [0.22, 1, 0.36, 1] }}
            className={cx(
              "panel-glass rounded-xl flex items-start gap-3 px-4 py-3.5 shadow-float",
              t.kind === "error" && "border-danger-500/40",
              t.kind === "success" && "border-gold-700/60",
            )}
          >
            {t.kind === "error" ? (
              <AlertTriangle className="w-4 h-4 text-danger-400 mt-0.5 shrink-0" />
            ) : t.kind === "success" ? (
              <CheckCircle2 className="w-4 h-4 text-gold-400 mt-0.5 shrink-0" />
            ) : (
              <Info className="w-4 h-4 text-ouro-400 mt-0.5 shrink-0" />
            )}
            <p className="text-sm text-mist-200 leading-snug flex-1">{t.msg}</p>
            <button
              aria-label="Dismiss notification"
              onClick={() => dismiss(t.id)}
              className="text-mist-600 hover:text-mist-300 transition-colors"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </motion.div>
        ))}
      </AnimatePresence>
    </div>,
    document.body,
  );
}

/* ═══════════════════════════════════════════════════
   Motion
   ═══════════════════════════════════════════════════ */

export function Reveal({
  children,
  delay = 0,
  y = 20,
  className,
}: {
  children: ReactNode;
  delay?: number;
  y?: number;
  className?: string;
}) {
  const reduceOs = useReducedMotion();
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);
  const off = reduceOs || motionOff;
  return (
    <motion.div
      className={className}
      initial={off ? false : { opacity: 0, y }}
      whileInView={off ? undefined : { opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-70px" }}
      transition={{ duration: 0.6, delay, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

export function PageFade({
  children,
  id,
}: {
  children: ReactNode;
  id: string;
}) {
  const motionOff = usePrefs((s) => !s.prefs.reader.motion);
  return (
    <motion.div
      key={id}
      initial={motionOff ? false : { opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      exit={motionOff ? undefined : { opacity: 0, y: -6 }}
      transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
    >
      {children}
    </motion.div>
  );
}

/* ═══════════════════════════════════════════════════
   Resilience
   ═══════════════════════════════════════════════════ */

/** Full-page brand loader for lazy-loaded views. */
export function PageLoader({
  label = "Opening the reading room…",
}: {
  label?: string;
}) {
  return (
    <div
      className="flex flex-col items-center justify-center py-28 gap-6"
      role="status"
      aria-label={label}
    >
      <BrandMark
        size={64}
        animated
        className="text-gold-500"
        strokeWidth={2.5}
      />
      <p className="text-[11px] font-display uppercase tracking-[0.3em] text-mist-500 animate-pulse-soft">
        {label}
      </p>
    </div>
  );
}

interface BoundaryState {
  error: Error | null;
}

/** Catches render errors so a crash in one view shows a recovery panel
 *  instead of blanking the whole app. */
export class ErrorBoundary extends Component<
  { children: ReactNode },
  BoundaryState
> {
  state: BoundaryState = { error: null };

  static getDerivedStateFromError(error: Error): BoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(
      "Lemniscate recovered from a view error:",
      error,
      info.componentStack,
    );
  }

  render(): ReactNode {
    if (this.state.error) {
      return (
        <BoundaryFallback
          error={this.state.error}
          onReset={() => this.setState({ error: null })}
        />
      );
    }
    return this.props.children;
  }
}

function BoundaryFallback({
  error,
  onReset,
}: {
  error: Error;
  onReset: () => void;
}) {
  const go = useNav((s) => s.go);
  return (
    <div className="max-w-xl mx-auto px-6 py-24">
      <div className="panel rounded-2xl p-8 text-center">
        <BrandMark size={44} className="text-gold-500 mx-auto mb-5" />
        <h2 className="font-display text-xl text-mist-100 mb-2">
          The page lost its place
        </h2>
        <p className="text-sm text-mist-500 leading-relaxed mb-2">
          Something went wrong while rendering this view. Your library and
          reading position are safe — this is only a display fault.
        </p>
        <p className="text-[11px] font-mono text-mist-600 bg-ink-800 border border-ink-700 rounded-lg px-3 py-2 mb-6 truncate">
          {error.message}
        </p>
        <div className="flex justify-center gap-3 flex-wrap">
          <Button variant="gold" onClick={onReset}>
            <RotateCcw className="w-4 h-4" />
            Try again
          </Button>
          <Button variant="outline" onClick={() => go("dashboard")}>
            <Home className="w-4 h-4" />
            Back to dashboard
          </Button>
        </div>
      </div>
    </div>
  );
}
