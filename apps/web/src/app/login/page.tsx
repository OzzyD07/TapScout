import type { Metadata } from "next";
import { MapIcon, PhoneIcon, ShieldIcon } from "@/components/icons";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const metadata: Metadata = { title: "Sign in" };

const FEATURES = [
  {
    icon: <PhoneIcon size={16} />,
    title: "No test scripts",
    text: "Upload an APK or an iOS Simulator build. An NVIDIA Nemotron agent explores it on a real Android emulator and iOS Simulator.",
  },
  {
    icon: <ShieldIcon size={16} />,
    title: "Findings with evidence",
    text: "Every finding carries screenshots, the steps to reproduce it and how often it reproduced. Heuristic findings are reviewed by a second model.",
  },
  {
    icon: <MapIcon size={16} />,
    title: "See what was covered",
    text: "A live timeline while it runs, then a report with a map of every screen reached and what limited the run.",
  },
];

/** Measured on the project's own benchmark (docs/05 §21–§26), not marketing numbers. */
const NUMBERS = [
  { value: "6/6", label: "seeded bugs found in the sample app, Android and iOS" },
  { value: "<10%", label: "false positives on a benchmark of real open-source apps" },
  { value: "≈$0.01", label: "model cost per platform session" },
];

export default async function LoginPage({ searchParams }: PageProps<"/login">) {
  const params = await searchParams;
  const next = typeof params.next === "string" ? params.next : "/";

  return (
    <main className="grid min-h-dvh lg:grid-cols-[1.15fr_1fr]">
      <section className="bg-grid relative hidden flex-col justify-between border-r border-border px-12 py-10 lg:flex">
        <Logo />
        <div className="flex max-w-lg flex-col gap-8">
          <div className="flex flex-col gap-3">
            <p className="font-mono text-xs uppercase tracking-widest text-accent">
              Autonomous mobile QA
            </p>
            <h1 className="text-4xl font-semibold leading-tight tracking-tight">
              Your app, tested by an agent that writes no scripts.
            </h1>
          </div>
          <ul className="flex flex-col gap-5">
            {FEATURES.map((f) => (
              <li key={f.title} className="flex gap-3">
                <span className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-border bg-surface text-accent shadow-xs">
                  {f.icon}
                </span>
                <div>
                  <p className="text-sm font-semibold">{f.title}</p>
                  <p className="text-sm text-muted">{f.text}</p>
                </div>
              </li>
            ))}
          </ul>
          <dl className="grid grid-cols-3 gap-3">
            {NUMBERS.map((n) => (
              <div key={n.label} className="rounded-lg border border-border bg-surface/80 p-3">
                <dt className="sr-only">{n.label}</dt>
                <dd className="font-mono text-xl font-semibold tabular-nums">{n.value}</dd>
                <dd className="mt-1 text-xs leading-snug text-muted">{n.label}</dd>
              </div>
            ))}
          </dl>
        </div>
        <p className="text-xs text-faint">
          Planner: NVIDIA Nemotron on Nebius Token Factory · Devices: GitHub-hosted Android emulator
          and iOS Simulator
        </p>
      </section>

      <section className="flex flex-col justify-center px-4 py-12 sm:px-8">
        <div className="mx-auto flex w-full max-w-sm flex-col gap-8">
          <div className="flex flex-col gap-3">
            <span className="lg:hidden">
              <Logo />
            </span>
            <div>
              <h2 className="text-2xl font-semibold tracking-tight">Sign in</h2>
              <p className="mt-1 text-sm text-muted">Use the account you were given.</p>
            </div>
          </div>
          <LoginForm next={next} />
          <p className="text-xs text-faint">
            Accounts are created by the TapScout team; public sign-up is disabled.
          </p>
          <div className="flex flex-col gap-2 border-t border-border pt-6 text-xs text-muted lg:hidden">
            {NUMBERS.map((n) => (
              <p key={n.label}>
                <span className="font-mono font-semibold text-text">{n.value}</span> {n.label}
              </p>
            ))}
          </div>
        </div>
      </section>
    </main>
  );
}
