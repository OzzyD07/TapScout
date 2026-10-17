"use client";

import { MODES, TEST_NOTE_MAX, type TestMode } from "@tapscout/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { AlertIcon, CheckIcon, KeyIcon, PhoneIcon, PlayIcon, TabletIcon } from "@/components/icons";
import { buttonClass, Card, CardHeader, inputClass } from "@/components/ui";

export interface BuildOption {
  id: string;
  platform: "android" | "ios";
  appName: string;
  /** "sample: seeded", or the file name and upload date. */
  detail: string;
  isSample: boolean;
  testAccount: boolean;
  /** The test note given at upload, offered as this run's note. */
  note?: string;
}

const PLATFORMS = [
  { key: "android", name: "Android", device: "Android Emulator · API 35", Icon: PhoneIcon },
  { key: "ios", name: "iOS", device: "iOS Simulator · iOS 26", Icon: TabletIcon },
] as const;

const optionText = (b: BuildOption) =>
  `${b.appName} — ${b.detail}${b.testAccount ? " · test account" : ""}`;

/** `builds` is newest first; the newest build of each platform is preselected. */
export function StartTestForm({ builds }: { builds: BuildOption[] }) {
  const router = useRouter();
  const byPlatform = {
    android: builds.filter((b) => b.platform === "android"),
    ios: builds.filter((b) => b.platform === "ios"),
  };
  const [chosen, setChosen] = useState({
    android: byPlatform.android[0]?.id,
    ios: byPlatform.ios[0]?.id,
  });
  const selected = {
    android: byPlatform.android.find((b) => b.id === chosen.android),
    ios: byPlatform.ios.find((b) => b.id === chosen.ios),
  };
  const [platforms, setPlatforms] = useState({
    android: Boolean(selected.android),
    ios: Boolean(selected.ios),
  });
  // The note of the chosen build(s) until the user edits it.
  const buildNote = [
    platforms.android ? selected.android?.note : undefined,
    platforms.ios ? selected.ios?.note : undefined,
  ]
    .filter((n, i, all): n is string => Boolean(n) && all.indexOf(n) === i)
    .join(" ");
  const [noteEdit, setNoteEdit] = useState<string | null>(null);
  const note = noteEdit ?? buildNote;
  const [modes, setModes] = useState<TestMode[]>(["functional"]);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const toggleMode = (mode: TestMode) =>
    setModes((cur) => (cur.includes(mode) ? cur.filter((m) => m !== mode) : [...cur, mode]));
  const allModes = MODES.map((m) => m.mode);
  const allOn = modes.length === allModes.length;
  const chosenPlatforms = PLATFORMS.filter((p) => platforms[p.key] && selected[p.key]);
  const canStart = chosenPlatforms.length > 0 && modes.length > 0 && !pending;

  function submit() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          builds: {
            ...(platforms.android && selected.android ? { android: selected.android.id } : {}),
            ...(platforms.ios && selected.ios ? { ios: selected.ios.id } : {}),
          },
          modes,
          ...(note.trim() ? { testNote: note.trim() } : {}),
        }),
      });
      const body = (await res.json().catch(() => ({}))) as {
        runId?: string;
        error?: { message?: string };
      };
      if (!res.ok || !body.runId) {
        setError(body.error?.message ?? "Could not start the test. Try again.");
        return;
      }
      router.push(`/runs/${body.runId}`);
    });
  }

  if (!selected.android && !selected.ios) {
    return (
      <Card className="flex flex-col items-center gap-2 border-dashed px-6 py-10 text-center">
        <PhoneIcon size={20} className="text-faint" />
        <p className="text-sm font-medium">No builds yet</p>
        <p className="max-w-sm text-sm text-muted">
          Sample Android and iOS builds appear here, or upload your own build below.
        </p>
      </Card>
    );
  }

  return (
    <Card as="section">
      <CardHeader
        title="New test"
        description="Pick the builds and what to test. A run takes about 5–15 minutes per platform."
        icon={<PlayIcon size={14} />}
      />

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5">
        <fieldset className="flex flex-col gap-2.5">
          <legend className="mb-2.5 text-xs font-medium uppercase tracking-wide text-muted">
            Platforms
          </legend>
          <div className="grid gap-3 sm:grid-cols-2">
            {PLATFORMS.map(({ key, name, device, Icon }) => {
              const build = selected[key];
              const on = platforms[key] && Boolean(build);
              return (
                <div
                  key={key}
                  className={`flex flex-col gap-3 rounded-lg border p-3 transition-colors ${
                    !build
                      ? "border-dashed border-border opacity-70"
                      : on
                        ? "border-accent/50 bg-accent/5 ring-1 ring-accent/20"
                        : "border-border bg-surface hover:border-border-strong"
                  }`}
                >
                  <label className="flex cursor-pointer items-center gap-3">
                    <input
                      type="checkbox"
                      checked={on}
                      disabled={!build}
                      onChange={(e) => setPlatforms((p) => ({ ...p, [key]: e.target.checked }))}
                      className="peer sr-only"
                    />
                    <span
                      className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md border ${
                        on
                          ? "border-accent/40 bg-accent/10 text-accent"
                          : "border-border bg-surface-2 text-muted"
                      }`}
                    >
                      <Icon size={18} />
                    </span>
                    <span className="flex min-w-0 flex-1 flex-col">
                      <span className="text-sm font-semibold">{name}</span>
                      <span className="text-xs text-muted">{build ? device : "No build yet"}</span>
                    </span>
                    <span
                      className={`flex h-5 w-5 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
                        on ? "border-accent bg-accent text-on-accent" : "border-border-strong"
                      }`}
                    >
                      {on ? <CheckIcon size={13} strokeWidth={2.5} /> : null}
                    </span>
                  </label>
                  {build ? (
                    byPlatform[key].length > 1 ? (
                      <select
                        aria-label={`${name} build`}
                        value={build.id}
                        onChange={(e) => setChosen((c) => ({ ...c, [key]: e.target.value }))}
                        className={`${inputClass} h-9 pr-8`}
                      >
                        {byPlatform[key].map((b) => (
                          <option key={b.id} value={b.id}>
                            {optionText(b)}
                          </option>
                        ))}
                      </select>
                    ) : (
                      <p className="truncate rounded-md bg-surface-2 px-2.5 py-1.5 text-xs text-muted">
                        {optionText(build)}
                      </p>
                    )
                  ) : null}
                  {build?.testAccount ? (
                    <p className="flex items-center gap-1.5 text-xs text-muted">
                      <KeyIcon size={13} /> Signs in with the build's test account
                    </p>
                  ) : null}
                </div>
              );
            })}
          </div>
        </fieldset>

        <fieldset className="flex flex-col gap-2.5">
          <div className="mb-2.5 flex items-center justify-between gap-3">
            <legend className="text-xs font-medium uppercase tracking-wide text-muted">
              Test modes <span className="font-mono normal-case">{modes.length}/5</span>
            </legend>
            <button
              type="button"
              onClick={() => setModes(allOn ? ["functional"] : allModes)}
              className="text-xs font-medium text-accent hover:underline"
            >
              {allOn ? "Reset" : "Full autonomous test (all 5)"}
            </button>
          </div>
          <div className="grid gap-2 sm:grid-cols-2">
            {MODES.map((m) => {
              const on = modes.includes(m.mode);
              return (
                <label
                  key={m.mode}
                  className={`flex cursor-pointer gap-3 rounded-lg border p-3 text-sm transition-colors ${
                    on ? "border-accent/50 bg-accent/5" : "border-border hover:border-border-strong"
                  }`}
                >
                  <input
                    type="checkbox"
                    checked={on}
                    onChange={() => toggleMode(m.mode)}
                    className="peer sr-only"
                  />
                  <span
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded border peer-focus-visible:ring-2 peer-focus-visible:ring-accent ${
                      on ? "border-accent bg-accent text-on-accent" : "border-border-strong"
                    }`}
                  >
                    {on ? <CheckIcon size={11} strokeWidth={3} /> : null}
                  </span>
                  <span className="flex flex-col gap-0.5">
                    <span className="font-medium">{m.label}</span>
                    <span className="text-xs leading-snug text-muted">{m.description}</span>
                  </span>
                </label>
              );
            })}
          </div>
        </fieldset>

        <label className="flex flex-col gap-1.5">
          <span className="flex items-baseline justify-between gap-3">
            <span className="text-xs font-medium uppercase tracking-wide text-muted">
              Test note <span className="normal-case">(optional)</span>
            </span>
            <span className="font-mono text-xs text-faint">
              {note.length}/{TEST_NOTE_MAX}
            </span>
          </span>
          <textarea
            value={note}
            maxLength={TEST_NOTE_MAX}
            rows={2}
            placeholder={
              'What to focus on, e.g. "try editing a note" or "the sign-in screen has a demo account button"'
            }
            onChange={(e) => setNoteEdit(e.target.value)}
            className={`${inputClass} resize-y py-2`}
          />
          <span className="text-xs text-muted">
            A goal for the first half of the run, then the rest of the app gets its turn. The agent
            still never deletes, posts or buys anything.
          </span>
        </label>
      </div>

      <div className="flex flex-col gap-3 border-t border-border bg-surface-2/50 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <p className="text-xs text-muted">
          {chosenPlatforms.length === 0
            ? "Choose at least one platform."
            : modes.length === 0
              ? "Choose at least one test mode."
              : `${chosenPlatforms.map((p) => p.name).join(" + ")} · ${modes.length} ${modes.length === 1 ? "mode" : "modes"} · real emulator and simulator in the cloud`}
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!canStart}
          className={`${buttonClass("primary")} w-full sm:w-auto`}
        >
          <PlayIcon size={14} />
          {pending ? "Starting…" : "Start test"}
        </button>
      </div>
      {error ? (
        <p
          role="alert"
          className="flex items-start gap-2 border-t border-danger/20 bg-danger/10 px-4 py-2.5 text-sm text-danger sm:px-5"
        >
          <AlertIcon size={15} className="mt-0.5 shrink-0" />
          {error}
        </p>
      ) : null}
    </Card>
  );
}
