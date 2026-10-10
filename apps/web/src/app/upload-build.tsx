"use client";

import type { CreateBuildUploadResponse } from "@tapscout/shared";
import { useRouter } from "next/navigation";
import { useState } from "react";

type Phase =
  | { kind: "idle" }
  | { kind: "uploading"; percent: number }
  | { kind: "checking" }
  | { kind: "done"; name: string }
  | { kind: "error"; message: string };

function platformOf(file: File): "android" | "ios" | null {
  const name = file.name.toLowerCase();
  if (name.endsWith(".apk")) return "android";
  if (name.endsWith(".zip")) return "ios";
  return null;
}

async function apiError(res: Response, fallback: string): Promise<string> {
  const body = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
  return body.error?.message ?? fallback;
}

/** PUT straight to Storage with progress; the API never sees the file (docs/02 §3). */
function putFile(
  upload: CreateBuildUploadResponse,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", upload.uploadUrl);
    for (const [k, v] of Object.entries(upload.requiredHeaders)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(Math.round((e.loaded / e.total) * 100));
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage refused the upload (HTTP ${xhr.status}).`));
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check the connection."));
    xhr.send(file);
  });
}

export function UploadBuild({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const [file, setFile] = useState<File | null>(null);
  const [appName, setAppName] = useState("");
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const platform = file ? platformOf(file) : null;
  const busy = phase.kind === "uploading" || phase.kind === "checking";

  function pick(f: File | null) {
    setFile(f);
    setPhase({ kind: "idle" });
    if (f && !appName) setAppName(f.name.replace(/\.(apk|zip)$/i, "").slice(0, 100));
  }

  async function upload() {
    if (!file || !platform) return;
    if (file.size > maxMb * 1024 * 1024) {
      setPhase({ kind: "error", message: `The file is larger than the ${maxMb} MB limit.` });
      return;
    }
    try {
      setPhase({ kind: "uploading", percent: 0 });
      const res = await fetch("/api/builds", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          platform,
          fileName: file.name,
          sizeBytes: file.size,
          contentType:
            platform === "android" ? "application/vnd.android.package-archive" : "application/zip",
          appName: appName.trim() || file.name,
        }),
      });
      if (!res.ok) throw new Error(await apiError(res, "Could not start the upload."));
      const created = (await res.json()) as CreateBuildUploadResponse;
      await putFile(created, file, (percent) => setPhase({ kind: "uploading", percent }));
      setPhase({ kind: "checking" });
      const done = await fetch(`/api/builds/${created.buildId}/complete`, { method: "POST" });
      if (!done.ok) throw new Error(await apiError(done, "The uploaded file was not accepted."));
      setPhase({ kind: "done", name: appName.trim() || file.name });
      setFile(null);
      setAppName("");
      router.refresh();
    } catch (error) {
      setPhase({ kind: "error", message: (error as Error).message });
    }
  }

  return (
    <details className="rounded-2xl border border-border bg-surface p-4 text-sm">
      <summary className="cursor-pointer font-semibold">Test your own build</summary>
      <div className="mt-3 flex flex-col gap-3">
        <p className="text-xs text-muted">
          Android: an x86_64-compatible <code>.apk</code>. iOS: a <code>.zip</code> containing an
          iOS Simulator <code>.app</code> (not a device build). Up to {maxMb} MB. The file goes
          straight to private storage; only you can start tests with it.
        </p>
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium">Build file</span>
            <input
              type="file"
              accept=".apk,.zip"
              disabled={busy}
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              className="text-xs file:mr-3 file:rounded-lg file:border file:border-border file:bg-bg file:px-3 file:py-1.5 file:text-sm file:font-medium"
            />
          </label>
          <label className="flex flex-1 flex-col gap-1">
            <span className="text-xs font-medium">App name</span>
            <input
              type="text"
              value={appName}
              maxLength={100}
              disabled={busy}
              onChange={(e) => setAppName(e.target.value)}
              className="h-9 rounded-lg border border-border bg-bg px-3"
            />
          </label>
          <button
            type="button"
            onClick={upload}
            disabled={!file || !platform || busy}
            className="h-9 rounded-lg bg-accent px-4 font-semibold text-white hover:bg-accent-strong disabled:opacity-50"
          >
            {phase.kind === "uploading"
              ? `Uploading ${phase.percent}%`
              : phase.kind === "checking"
                ? "Checking…"
                : "Upload"}
          </button>
        </div>
        {file && !platform ? (
          <p className="text-xs text-danger">Choose an .apk (Android) or .zip (iOS Simulator).</p>
        ) : file ? (
          <p className="text-xs text-muted">
            {platform === "android" ? "Android APK" : "iOS Simulator app (zip)"} ·{" "}
            {(file.size / (1024 * 1024)).toFixed(1)} MB
          </p>
        ) : null}
        {phase.kind === "uploading" ? (
          <progress value={phase.percent} max={100} className="h-1.5 w-full accent-accent" />
        ) : null}
        <p aria-live="polite" className="text-xs">
          {phase.kind === "done" ? (
            <span className="text-ok">
              {phase.name} is ready. Select it under Platforms and start a test; the device checks
              that it installs.
            </span>
          ) : phase.kind === "error" ? (
            <span className="text-danger">{phase.message}</span>
          ) : null}
        </p>
      </div>
    </details>
  );
}
