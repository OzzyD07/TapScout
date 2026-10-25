"use client";

import { type CreateBuildUploadResponse, TEST_NOTE_MAX } from "@tapscout/shared";
import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import {
  AlertIcon,
  CheckIcon,
  ChevronDownIcon,
  KeyIcon,
  UploadIcon,
  XIcon,
} from "@/components/icons";
import { buttonClass, Card, inputClass } from "@/components/ui";
import { unsupportedBuildReason } from "@/lib/builds/formats";

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
function putPart(
  url: string,
  headers: Record<string, string>,
  body: Blob,
  onProgress: (loaded: number) => void,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    xhr.open("PUT", url);
    for (const [k, v] of Object.entries(headers)) xhr.setRequestHeader(k, v);
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded);
    };
    xhr.onload = () =>
      xhr.status >= 200 && xhr.status < 300
        ? resolve()
        : reject(new Error(`Storage refused the upload (HTTP ${xhr.status}).`));
    xhr.onerror = () => reject(new Error("The upload was interrupted. Check the connection."));
    xhr.send(body);
  });
}

/**
 * The file goes to storage in the parts the server signed (each under the storage's 50 MB object
 * limit), one after another, with one progress figure for the whole file.
 */
async function putFile(
  upload: CreateBuildUploadResponse,
  file: File,
  onProgress: (percent: number) => void,
): Promise<void> {
  const urls = upload.partUrls?.length ? upload.partUrls : [upload.uploadUrl];
  for (const [i, url] of urls.entries()) {
    const start = i * upload.partBytes;
    const part = urls.length === 1 ? file : file.slice(start, start + upload.partBytes);
    await putPart(url, upload.requiredHeaders, part, (loaded) =>
      onProgress(Math.round(((start + loaded) / file.size) * 100)),
    );
  }
}

const label = "text-xs font-medium uppercase tracking-wide text-muted";

export function UploadBuild({ maxMb }: { maxMb: number }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [appName, setAppName] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [note, setNote] = useState("");
  const [dragging, setDragging] = useState(false);
  const [phase, setPhase] = useState<Phase>({ kind: "idle" });
  const platform = file ? platformOf(file) : null;
  const busy = phase.kind === "uploading" || phase.kind === "checking";
  const accountHalf = Boolean(username.trim()) !== Boolean(password);
  const fileProblem = file
    ? (unsupportedBuildReason(file.name) ??
      (!platform ? "Choose an .apk (Android) or .zip (iOS Simulator)." : null))
    : null;

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
          ...(username.trim() && password ? { testAccount: { username, password } } : {}),
          ...(note.trim() ? { testNote: note.trim() } : {}),
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
      setUsername("");
      setPassword("");
      setNote("");
      if (input.current) input.current.value = "";
      router.refresh();
    } catch (error) {
      setPhase({ kind: "error", message: (error as Error).message });
    }
  }

  return (
    <Card as="section" className="overflow-hidden">
      <details className="group" open={Boolean(file) || phase.kind !== "idle" || undefined}>
        <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
          <span className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-2 text-muted">
              <UploadIcon size={14} />
            </span>
            <span>
              <span className="block text-sm font-semibold">Test your own build</span>
              <span className="block text-xs text-muted">
                Android .apk or iOS Simulator .app as .zip · up to {maxMb} MB · private to you
              </span>
            </span>
          </span>
          <ChevronDownIcon
            size={16}
            className="shrink-0 text-muted transition-transform group-open:rotate-180"
          />
        </summary>

        <div className="flex flex-col gap-5 border-t border-border px-4 py-5 sm:px-5">
          {/* biome-ignore lint/a11y/noStaticElementInteractions: the drop zone wraps a real file input */}
          <div
            onDragOver={(e) => {
              e.preventDefault();
              if (!busy) setDragging(true);
            }}
            onDragLeave={() => setDragging(false)}
            onDrop={(e) => {
              e.preventDefault();
              setDragging(false);
              if (!busy) pick(e.dataTransfer.files?.[0] ?? null);
            }}
            className={`relative flex flex-col items-center gap-2 rounded-lg border border-dashed px-4 py-7 text-center transition-colors ${
              dragging
                ? "border-accent bg-accent/5"
                : file && !fileProblem
                  ? "border-ok/40 bg-ok/5"
                  : "border-border-strong bg-surface-2/40 hover:border-accent/50"
            }`}
          >
            <input
              ref={input}
              type="file"
              accept=".apk,.zip,.aab,.apks,.xapk,.ipa"
              disabled={busy}
              onChange={(e) => pick(e.target.files?.[0] ?? null)}
              aria-label="Build file"
              className="absolute inset-0 cursor-pointer opacity-0 disabled:cursor-not-allowed"
            />
            {file ? (
              <>
                <span
                  className={`flex h-9 w-9 items-center justify-center rounded-full ${fileProblem ? "bg-danger/10 text-danger" : "bg-ok/10 text-ok"}`}
                >
                  {fileProblem ? <XIcon size={16} /> : <CheckIcon size={16} />}
                </span>
                <p className="max-w-full truncate font-mono text-sm">{file.name}</p>
                <p className="text-xs text-muted">
                  {platform === "android"
                    ? "Android APK"
                    : platform === "ios"
                      ? "iOS Simulator app (zip)"
                      : "Unsupported file"}{" "}
                  · {(file.size / (1024 * 1024)).toFixed(1)} MB · click to choose another
                </p>
              </>
            ) : (
              <>
                <span className="flex h-9 w-9 items-center justify-center rounded-full bg-surface text-muted shadow-xs ring-1 ring-border">
                  <UploadIcon size={16} />
                </span>
                <p className="text-sm">
                  <span className="font-medium text-accent">Choose a file</span> or drop it here
                </p>
                <p className="text-xs text-muted">
                  .apk with arm64-v8a or x86_64 code, or a .zip of an iOS Simulator .app
                </p>
              </>
            )}
          </div>
          {fileProblem ? (
            <p className="-mt-3 flex items-start gap-2 text-xs text-danger">
              <AlertIcon size={14} className="mt-px shrink-0" /> {fileProblem}
            </p>
          ) : null}

          <details className="group/help rounded-lg border border-border bg-surface-2/40 text-xs">
            <summary className="flex cursor-pointer list-none items-center justify-between px-3 py-2 font-medium [&::-webkit-details-marker]:hidden">
              How do I get these files?
              <ChevronDownIcon
                size={14}
                className="text-muted transition-transform group-open/help:rotate-180"
              />
            </summary>
            <ul className="flex flex-col gap-2 border-t border-border px-3 py-3 text-muted [&_code]:rounded [&_code]:bg-surface [&_code]:px-1 [&_code]:py-px [&_code]:font-mono [&_code]:text-[11px] [&_code]:text-text">
              <li>
                <span className="font-medium text-text">Android (Gradle):</span>{" "}
                <code>./gradlew assembleRelease</code> (or <code>assembleDebug</code>); a universal
                APK or one with arm64-v8a or x86_64. Only an <code>.aab</code>?{" "}
                <code>bundletool build-apks --mode=universal</code>, then unzip{" "}
                <code>universal.apk</code>.
              </li>
              <li>
                <span className="font-medium text-text">iOS (Xcode):</span>{" "}
                <code>
                  xcodebuild -scheme App -sdk iphonesimulator -configuration Release
                  CODE_SIGNING_ALLOWED=NO build
                </code>
                , then zip the <code>.app</code> from{" "}
                <code>Build/Products/Release-iphonesimulator</code> (
                <code>ditto -c -k --keepParent App.app App.zip</code>).
              </li>
              <li>
                <span className="font-medium text-text">Expo:</span> an EAS profile with{" "}
                <code>
                  "ios": {"{"} "simulator": true {"}"}
                </code>{" "}
                and{" "}
                <code>
                  "android": {"{"} "buildType": "apk" {"}"}
                </code>
                .
              </li>
              <li>
                <span className="font-medium text-text">Flutter:</span>{" "}
                <code>flutter build apk</code>; <code>flutter build ios --simulator</code> (debug
                only), then zip <code>build/ios/iphonesimulator/Runner.app</code>.
              </li>
            </ul>
          </details>

          <div className="grid gap-4 sm:grid-cols-2">
            <label className="flex flex-col gap-1.5">
              <span className={label}>App name</span>
              <input
                type="text"
                value={appName}
                maxLength={100}
                disabled={busy}
                onChange={(e) => setAppName(e.target.value)}
                className={`${inputClass} h-9`}
              />
            </label>
            <label className="flex flex-col gap-1.5">
              <span className={label}>
                Test note <span className="normal-case">(optional)</span>
              </span>
              <input
                type="text"
                value={note}
                maxLength={TEST_NOTE_MAX}
                disabled={busy}
                placeholder="e.g. focus on creating and editing a habit"
                onChange={(e) => setNote(e.target.value)}
                className={`${inputClass} h-9`}
              />
            </label>
          </div>

          <fieldset className="flex flex-col gap-3 rounded-lg border border-border p-3">
            <legend className="flex items-center gap-1.5 px-1 text-xs font-medium">
              <KeyIcon size={13} className="text-muted" /> Test account{" "}
              <span className="font-normal text-muted">(optional)</span>
            </legend>
            <p className="text-xs text-muted">
              For apps behind a sign-in. Stored encrypted and handed only to the device that runs
              tests on this build; the AI planner never sees it. SMS codes, e-mail codes and
              CAPTCHAs still stop the test and are reported as such.
            </p>
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Username or e-mail</span>
                <input
                  type="text"
                  value={username}
                  maxLength={200}
                  disabled={busy}
                  autoComplete="off"
                  onChange={(e) => setUsername(e.target.value)}
                  className={`${inputClass} h-9`}
                />
              </label>
              <label className="flex flex-col gap-1.5">
                <span className="text-xs text-muted">Password</span>
                <input
                  type="password"
                  value={password}
                  maxLength={200}
                  disabled={busy}
                  autoComplete="new-password"
                  onChange={(e) => setPassword(e.target.value)}
                  className={`${inputClass} h-9`}
                />
              </label>
            </div>
            {accountHalf ? (
              <p className="text-xs text-warn">
                Enter both the username and the password, or neither.
              </p>
            ) : null}
          </fieldset>

          {phase.kind === "uploading" || phase.kind === "checking" ? (
            <div className="flex flex-col gap-1.5">
              <div className="flex justify-between text-xs text-muted">
                <span>{phase.kind === "checking" ? "Checking the file…" : "Uploading…"}</span>
                <span className="font-mono">
                  {phase.kind === "uploading" ? `${phase.percent}%` : ""}
                </span>
              </div>
              <div className="h-1.5 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-accent transition-[width]"
                  style={{ width: `${phase.kind === "uploading" ? phase.percent : 100}%` }}
                />
              </div>
            </div>
          ) : null}

          <div aria-live="polite">
            {phase.kind === "done" ? (
              <p className="flex items-start gap-2 rounded-lg border border-ok/25 bg-ok/10 px-3 py-2 text-sm text-ok">
                <CheckIcon size={15} className="mt-0.5 shrink-0" />
                {phase.name} is ready: select it under Platforms and start a test. The device checks
                that it installs.
              </p>
            ) : phase.kind === "error" ? (
              <p className="flex items-start gap-2 rounded-lg border border-danger/25 bg-danger/10 px-3 py-2 text-sm text-danger">
                <AlertIcon size={15} className="mt-0.5 shrink-0" />
                {phase.message}
              </p>
            ) : null}
          </div>

          <div className="flex justify-end">
            <button
              type="button"
              onClick={upload}
              disabled={!file || Boolean(fileProblem) || busy || accountHalf}
              className={`${buttonClass("primary")} w-full sm:w-auto`}
            >
              <UploadIcon size={14} />
              {phase.kind === "uploading"
                ? `Uploading ${phase.percent}%`
                : phase.kind === "checking"
                  ? "Checking…"
                  : "Upload build"}
            </button>
          </div>
        </div>
      </details>
    </Card>
  );
}
