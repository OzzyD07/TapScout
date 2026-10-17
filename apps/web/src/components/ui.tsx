// Shared building blocks of the web app. Server-safe (no hooks): pages and client components both
// use them. Colours come only from the tokens in globals.css.

import type { Tone } from "@/lib/runs/timeline";

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "border-border bg-surface-2 text-muted",
  info: "border-accent/25 bg-accent/10 text-accent",
  ok: "border-ok/25 bg-ok/10 text-ok",
  warn: "border-warn/25 bg-warn/10 text-warn",
  danger: "border-danger/25 bg-danger/10 text-danger",
};

export const DOT_CLASSES: Record<Tone, string> = {
  neutral: "bg-faint",
  info: "bg-accent",
  ok: "bg-ok",
  warn: "bg-warn",
  danger: "bg-danger",
};

export const TEXT_TONE: Record<Tone, string> = {
  neutral: "",
  info: "text-accent",
  ok: "text-ok",
  warn: "text-warn",
  danger: "text-danger",
};

export function Badge(props: {
  tone: Tone;
  dot?: boolean;
  pulse?: boolean;
  children: React.ReactNode;
}) {
  return (
    <span
      className={`inline-flex h-6 shrink-0 items-center gap-1.5 rounded-md border px-2 text-xs font-medium whitespace-nowrap ${TONE_CLASSES[props.tone]}`}
    >
      {props.dot ? (
        <span
          className={`h-1.5 w-1.5 rounded-full ${DOT_CLASSES[props.tone]} ${props.pulse ? "animate-pulse-dot" : ""}`}
        />
      ) : null}
      {props.children}
    </span>
  );
}

/** A small neutral tag (modes, metadata). */
export function Tag({ children }: { children: React.ReactNode }) {
  return (
    <span className="inline-flex h-6 items-center rounded-md border border-border bg-surface px-2 text-xs text-muted whitespace-nowrap">
      {children}
    </span>
  );
}

export function runTone(status: string, cancelRequested: boolean): Tone {
  if (cancelRequested && (status === "queued" || status === "running")) return "warn";
  if (status === "completed") return "ok";
  if (status === "partial") return "warn";
  if (status === "infrastructure_failed") return "danger";
  if (status === "running") return "info";
  return "neutral";
}

export const platformName = (p: string) => (p === "ios" ? "iOS Simulator" : "Android Emulator");
export const platformShort = (p: string) => (p === "ios" ? "iOS" : "Android");

type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

const BUTTON_VARIANTS: Record<ButtonVariant, string> = {
  primary:
    "bg-accent text-on-accent shadow-sm hover:bg-accent-strong disabled:hover:bg-accent border border-transparent",
  secondary: "border border-border bg-surface text-text shadow-xs hover:bg-surface-2",
  ghost: "border border-transparent text-muted hover:bg-surface-2 hover:text-text",
  danger: "border border-danger/30 bg-surface text-danger hover:bg-danger/10",
};

/** Class names of a button or button-like link. */
export function buttonClass(variant: ButtonVariant = "secondary", size: "sm" | "md" = "md") {
  return `inline-flex items-center justify-center gap-2 rounded-lg font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${
    size === "sm" ? "h-8 px-3 text-sm" : "h-10 px-4 text-sm"
  } ${BUTTON_VARIANTS[variant]}`;
}

export const inputClass =
  "w-full rounded-lg border border-border bg-surface px-3 text-sm text-text shadow-xs outline-none transition placeholder:text-faint focus:border-accent focus:ring-3 focus:ring-accent/15 disabled:opacity-60";

export function Card(props: {
  className?: string;
  children: React.ReactNode;
  as?: "section" | "div";
}) {
  const Tag = props.as ?? "div";
  return (
    <Tag
      className={`rounded-xl border border-border bg-surface shadow-xs ${props.className ?? ""}`}
    >
      {props.children}
    </Tag>
  );
}

/** A card's title row: title, optional description, optional actions on the right. */
export function CardHeader(props: {
  title: React.ReactNode;
  description?: React.ReactNode;
  icon?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3 border-b border-border px-4 py-3 sm:px-5">
      <div className="flex min-w-0 items-start gap-3">
        {props.icon ? (
          <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-border bg-surface-2 text-muted">
            {props.icon}
          </span>
        ) : null}
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">{props.title}</h2>
          {props.description ? (
            <p className="mt-0.5 text-xs text-muted">{props.description}</p>
          ) : null}
        </div>
      </div>
      {props.actions ? <div className="flex items-center gap-2">{props.actions}</div> : null}
    </div>
  );
}

/** One number with its label (session counters, report totals). */
export function Stat(props: { label: string; value: React.ReactNode; tone?: Tone }) {
  return (
    <div className="flex flex-col gap-1 rounded-lg border border-border bg-surface px-3 py-2.5">
      <dt className="text-xs text-muted">{props.label}</dt>
      <dd
        className={`font-mono text-lg font-semibold tabular-nums ${TEXT_TONE[props.tone ?? "neutral"]}`}
      >
        {props.value}
      </dd>
    </div>
  );
}

/** The TapScout mark: a tap ring around a dot, in the accent colour. */
export function Logo({ withName = true }: { withName?: boolean }) {
  return (
    <span className="inline-flex items-center gap-2">
      <svg width="22" height="22" viewBox="0 0 24 24" aria-hidden="true" className="text-accent">
        <rect x="1" y="1" width="22" height="22" rx="6" fill="currentColor" opacity="0.14" />
        <circle cx="12" cy="12" r="6.25" fill="none" stroke="currentColor" strokeWidth="1.75" />
        <circle cx="12" cy="12" r="2.25" fill="currentColor" />
      </svg>
      {withName ? <span className="text-[15px] font-semibold tracking-tight">TapScout</span> : null}
    </span>
  );
}

/** Relative time for lists ("3 min ago"); full timestamp goes in the title attribute. */
export function relativeTime(iso: string, now = Date.now()): string {
  const s = Math.round((now - new Date(iso).getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  if (d < 30) return `${d} d ago`;
  return new Date(iso).toLocaleDateString("en", { month: "short", day: "numeric" });
}
