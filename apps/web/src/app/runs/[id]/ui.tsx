import type { Tone } from "@/lib/runs/timeline";

export const TONE_CLASSES: Record<Tone, string> = {
  neutral: "bg-border/60 text-text",
  info: "bg-accent/15 text-accent",
  ok: "bg-ok/15 text-ok",
  warn: "bg-warn/15 text-warn",
  danger: "bg-danger/15 text-danger",
};

export function Badge({ tone, children }: { tone: Tone; children: React.ReactNode }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${TONE_CLASSES[tone]}`}
    >
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
