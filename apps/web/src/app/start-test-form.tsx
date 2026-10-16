"use client";

import { MODES, TEST_NOTE_MAX, type TestMode } from "@tapscout/shared";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

export interface BuildOption {
  id: string;
  platform: "android" | "ios";
  label: string;
  /** The test note given at upload, offered as this run's note. */
  note?: string;
}

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
  const android = byPlatform.android.find((b) => b.id === chosen.android);
  const ios = byPlatform.ios.find((b) => b.id === chosen.ios);
  const [platforms, setPlatforms] = useState({ android: Boolean(android), ios: Boolean(ios) });
  // The note of the chosen build(s) until the user edits it.
  const buildNote = [
    platforms.android ? android?.note : undefined,
    platforms.ios ? ios?.note : undefined,
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
  const canStart = (platforms.android || platforms.ios) && modes.length > 0 && !pending;

  function submit() {
    setError(null);
    start(async () => {
      const res = await fetch("/api/runs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          builds: {
            ...(platforms.android && android ? { android: android.id } : {}),
            ...(platforms.ios && ios ? { ios: ios.id } : {}),
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

  if (!android && !ios) {
    return (
      <p className="rounded-xl border border-dashed border-border p-6 text-sm text-muted">
        No builds yet. Sample Android and iOS builds will appear here, or upload your own below.
      </p>
    );
  }

  return (
    <div className="flex flex-col gap-5 rounded-2xl border border-border bg-surface p-5">
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Platforms</legend>
        <div className="flex flex-wrap gap-3">
          {(
            [
              ["android", android],
              ["ios", ios],
            ] as const
          ).map(([key, build]) =>
            build ? (
              <div
                key={key}
                className="flex flex-col gap-2 rounded-lg border border-border px-3 py-2 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5"
              >
                <label className="flex cursor-pointer items-center gap-2">
                  <input
                    type="checkbox"
                    checked={platforms[key]}
                    onChange={(e) => setPlatforms((p) => ({ ...p, [key]: e.target.checked }))}
                    className="accent-accent"
                  />
                  {key === "ios" ? "iOS Simulator" : "Android"}
                </label>
                {byPlatform[key].length > 1 ? (
                  <select
                    aria-label={`${key === "ios" ? "iOS" : "Android"} build`}
                    value={build.id}
                    onChange={(e) => setChosen((c) => ({ ...c, [key]: e.target.value }))}
                    className="h-8 max-w-xs rounded-md border border-border bg-bg px-2 text-xs"
                  >
                    {byPlatform[key].map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}
                      </option>
                    ))}
                  </select>
                ) : (
                  <span className="text-xs text-muted">{build.label}</span>
                )}
              </div>
            ) : null,
          )}
        </div>
      </fieldset>

      <fieldset className="flex flex-col gap-2">
        <div className="mb-1 flex items-center justify-between">
          <legend className="text-sm font-semibold">Test modes</legend>
          <button
            type="button"
            onClick={() => setModes(modes.length === allModes.length ? ["functional"] : allModes)}
            className="text-xs font-medium text-accent"
          >
            {modes.length === allModes.length ? "Reset" : "Full Autonomous Test"}
          </button>
        </div>
        <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
          {MODES.map((m) => (
            <label
              key={m.mode}
              className="flex cursor-pointer gap-2 rounded-lg border border-border p-3 text-sm has-[:checked]:border-accent has-[:checked]:bg-accent/5"
            >
              <input
                type="checkbox"
                checked={modes.includes(m.mode)}
                onChange={() => toggleMode(m.mode)}
                className="mt-0.5 accent-accent"
              />
              <span>
                <span className="block font-medium">{m.label}</span>
                <span className="block text-xs text-muted">{m.description}</span>
              </span>
            </label>
          ))}
        </div>
      </fieldset>

      <label className="flex flex-col gap-1">
        <span className="text-sm font-semibold">Test note (optional)</span>
        <span className="text-xs text-muted">
          What to focus on, in a sentence: &quot;try editing a note&quot;, &quot;the sign-in screen
          has a demo account button&quot;. The agent treats it as a goal; it still never deletes,
          posts or buys anything.
        </span>
        <textarea
          value={note}
          maxLength={TEST_NOTE_MAX}
          rows={2}
          onChange={(e) => setNoteEdit(e.target.value)}
          className="rounded-lg border border-border bg-bg px-3 py-2 text-sm"
        />
      </label>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs text-muted">
          Runs on a real Android emulator and iOS Simulator in the cloud. A run takes a few minutes.
        </p>
        <button
          type="button"
          onClick={submit}
          disabled={!canStart}
          className="h-11 rounded-lg bg-accent px-5 font-semibold text-white transition hover:bg-accent-strong disabled:opacity-50"
        >
          {pending ? "Starting…" : "Start Test"}
        </button>
      </div>
      {error ? (
        <p role="alert" className="text-sm text-danger">
          {error}
        </p>
      ) : null}
    </div>
  );
}
