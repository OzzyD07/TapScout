"use client";

import { MODES } from "@tapscout/shared";
import { useEffect, useMemo, useState } from "react";
import type { CheckView, FindingView, SummaryView } from "@/lib/report/view";
import { phaseLabel, runStatusLabel, type Tone } from "@/lib/runs/timeline";
import { Badge, platformName, platformShort, runTone } from "./ui";

export interface ReportSnapshot {
  overallStatus: string;
  createdAt: string;
  limitations: string[];
  checks: CheckView[];
  findings: FindingView[];
  summary: SummaryView | null;
}

const CHECK_STATUS: Record<string, { label: string; tone: Tone }> = {
  passed_within_scope: { label: "Passed (within scope)", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  inconclusive: { label: "Inconclusive", tone: "warn" },
  not_tested: { label: "Not tested", tone: "neutral" },
  unsupported: { label: "Unsupported", tone: "neutral" },
};

const STORE_STATUS: Record<string, { label: string; tone: Tone }> = {
  evidence_found: { label: "Evidence found", tone: "ok" },
  potential_risk: { label: "Potential risk", tone: "warn" },
  needs_additional_information: { label: "Needs more information", tone: "neutral" },
  not_applicable: { label: "Not applicable", tone: "neutral" },
  not_assessed: { label: "Not assessed", tone: "neutral" },
};

const SEVERITY_TONE: Record<string, Tone> = {
  critical: "danger",
  high: "danger",
  medium: "warn",
  low: "neutral",
  info: "neutral",
};

const EVIDENCE_KIND: Record<string, string> = {
  measured: "Measured",
  tool_audit: "Tool audit",
  runtime_signal: "Runtime signal",
  ai_visual: "AI visual estimate",
  subjective: "Subjective",
};

const checkName = (id: string) =>
  ({
    "functional.flow_transitions": "Screen transitions",
    "functional.form_feedback": "Form feedback",
    "functional.return_paths": "Return paths",
    "functional.persistence": "Saved data after relaunch",
    "a11y.control_labels": "Control labels",
    "a11y.touch_targets": "Touch target size",
    "ui.keyboard_occlusion": "Controls under the keyboard",
    "ui.text_clipping": "Clipped text (AI estimate)",
    "store.account_deletion": "In-app account deletion",
    "store.privacy_policy": "Privacy policy",
    "stress.long_text": "Long text input",
    "stress.crash": "Unexpected app exit",
  })[id] ?? id;

const modeLabel = (m: string) => MODES.find((x) => x.mode === m)?.label ?? m;
const modeRank = (m: string) => {
  const i = MODES.findIndex((x) => x.mode === m);
  return i < 0 ? MODES.length : i;
};

function FilterGroup(props: {
  label: string;
  value: string;
  options: { value: string; label: string; count?: number }[];
  onChange(value: string): void;
}) {
  return (
    // biome-ignore lint/a11y/useSemanticElements: a fieldset would add a legend box; this is a toolbar of toggle buttons
    <div role="group" aria-label={props.label} className="flex flex-wrap items-center gap-1.5">
      <span className="text-xs text-muted">{props.label}</span>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={props.value === o.value}
          onClick={() => props.onChange(o.value)}
          className={`rounded-full border px-2.5 py-0.5 text-xs font-medium ${
            props.value === o.value
              ? "border-accent bg-accent/15 text-accent"
              : "border-border text-muted hover:text-text"
          }`}
        >
          {o.label}
          {o.count !== undefined ? <span className="ml-1 opacity-70">{o.count}</span> : null}
        </button>
      ))}
    </div>
  );
}

/** Summary text with validated `[F1]` references turned into links to the finding cards. */
function SummaryText(props: { summary: SummaryView; onJump(findingId: string): void }) {
  const parts = props.summary.text.split(/(\[F\d+\]|\bF\d+\b)/g);
  return (
    <p className="text-sm leading-relaxed">
      {parts.map((part, i) => {
        const label = part.replace(/[[\]]/g, "");
        const id = /^F\d+$/.test(label) ? props.summary.refs[label] : undefined;
        if (!id) return part;
        return (
          <a
            // biome-ignore lint/suspicious/noArrayIndexKey: parts of one fixed string
            key={i}
            href={`#finding-${id}`}
            onClick={(e) => {
              e.preventDefault();
              props.onJump(id);
            }}
            className="mx-0.5 rounded bg-accent/15 px-1 font-mono text-xs font-semibold text-accent hover:bg-accent/25"
          >
            {label}
          </a>
        );
      })}
    </p>
  );
}

function FindingCard(props: {
  finding: FindingView;
  focused: boolean;
  onShowEvidence(platform: string, artifactId: string): void;
}) {
  const f = props.finding;
  return (
    <article
      id={`finding-${f.findingId}`}
      className={`flex scroll-mt-6 flex-col gap-1 rounded-xl border p-3 text-sm transition-shadow ${
        props.focused ? "border-accent ring-2 ring-accent/40" : "border-border"
      }`}
    >
      <div className="flex flex-wrap items-center gap-2">
        <span className="font-mono text-xs font-semibold text-muted">{f.label}</span>
        <Badge tone={SEVERITY_TONE[f.severity] ?? "neutral"}>{f.severity}</Badge>
        <span className="font-medium">{f.title}</span>
      </div>
      <p className="text-xs text-muted">
        {platformName(f.platform)} · {modeLabel(f.mode)} · {f.reproduction}
      </p>
      <p className="text-muted">
        <span className="font-medium text-text">Expected:</span> {f.expected}
      </p>
      <p className="text-muted">
        <span className="font-medium text-text">Observed:</span> {f.observed}
      </p>
      <p className="text-xs text-muted">
        Evidence: {EVIDENCE_KIND[f.evidenceKind] ?? f.evidenceKind} ({f.confidence} confidence) ·
        Basis: {f.basis.replace(/_/g, " ")}
        {f.conditions.length > 0 ? ` · ${f.conditions.join(", ")}` : ""}
      </p>
      <p className="text-xs text-muted">
        Why {f.severity}: {f.severityRationale}
      </p>
      {f.replay ? (
        <details className="rounded-lg bg-bg/60 px-3 py-2 text-xs">
          <summary className="cursor-pointer font-medium text-text">
            Steps to reproduce ({f.replay.steps.length})
          </summary>
          <div className="mt-2 flex flex-col gap-1.5 text-muted">
            <p>
              <span className="font-medium text-text">Start:</span> {f.replay.precondition}
            </p>
            <ol className="list-decimal pl-5">
              {f.replay.steps.map((s, i) => (
                // biome-ignore lint/suspicious/noArrayIndexKey: steps are an ordered, immutable list
                <li key={i}>
                  {s.description}
                  {s.locator ? <code className="ml-1.5 text-[11px]">{s.locator}</code> : null}
                </li>
              ))}
            </ol>
            {f.replay.perturbation ? (
              <p>
                <span className="font-medium text-text">Input:</span> {f.replay.perturbation}
              </p>
            ) : null}
            <p>
              <span className="font-medium text-text">Check:</span> {f.replay.observe}
            </p>
          </div>
        </details>
      ) : null}
      {f.evidence.length > 0 ? (
        <div className="flex flex-wrap gap-3 text-xs">
          {f.evidence.map((e, i) => (
            <button
              // biome-ignore lint/suspicious/noArrayIndexKey: the same artifact can appear in two roles
              key={`${e.artifactId}-${i}`}
              type="button"
              className="font-medium text-accent"
              onClick={() => props.onShowEvidence(f.platform, e.artifactId)}
            >
              {e.role} screenshot
            </button>
          ))}
        </div>
      ) : null}
    </article>
  );
}

export function ReportSection(props: {
  report: ReportSnapshot;
  phases: { platform: string; phase: string }[];
  onShowEvidence(platform: string, artifactId: string): void;
}) {
  const { report } = props;
  const [platform, setPlatform] = useState("all");
  const [mode, setMode] = useState("all");
  const [focusId, setFocusId] = useState<string | null>(null);

  useEffect(() => {
    if (!focusId) return;
    document.getElementById(`finding-${focusId}`)?.scrollIntoView({ block: "center" });
    const t = setTimeout(() => setFocusId(null), 2500);
    return () => clearTimeout(t);
  }, [focusId]);

  const platforms = useMemo(
    () =>
      [
        ...new Set([
          ...props.phases.map((p) => p.platform),
          ...report.findings.map((f) => f.platform),
        ]),
      ].sort(),
    [props.phases, report.findings],
  );
  const modes = useMemo(
    () =>
      [
        ...new Set([...report.checks.map((c) => c.mode), ...report.findings.map((f) => f.mode)]),
      ].sort((a, b) => modeRank(a) - modeRank(b)),
    [report.checks, report.findings],
  );

  const matches = (item: { platform: string; mode: string }) =>
    (platform === "all" || item.platform === platform) && (mode === "all" || item.mode === mode);
  const findings = report.findings.filter(matches);
  const checks = report.checks
    .filter(matches)
    .sort(
      (a, b) =>
        modeRank(a.mode) - modeRank(b.mode) ||
        a.checkId.localeCompare(b.checkId) ||
        a.platform.localeCompare(b.platform),
    );
  const checkModes = [...new Set(checks.map((c) => c.mode))];
  const filtered = platform !== "all" || mode !== "all";

  return (
    <section
      aria-label="Report"
      className="flex flex-col gap-3 rounded-2xl border border-border bg-surface p-4"
    >
      <div className="flex flex-wrap items-center gap-3">
        <h2 className="text-lg font-semibold">Report</h2>
        <Badge tone={runTone(report.overallStatus, false)}>
          {runStatusLabel(report.overallStatus, false)}
        </Badge>
        <span className="text-sm text-muted">
          {props.phases
            .map((p) => `${platformName(p.platform)}: ${phaseLabel(p.phase)}`)
            .join(" · ")}
        </span>
      </div>

      {report.summary ? (
        <div className="flex flex-col gap-1.5 rounded-xl border border-accent/30 bg-accent/5 p-3">
          <h3 className="text-xs font-semibold uppercase tracking-wide text-accent">Summary</h3>
          <SummaryText
            summary={report.summary}
            onJump={(id) => {
              setPlatform("all");
              setMode("all");
              setFocusId(id);
            }}
          />
          <p className="text-xs text-muted">
            Written by {report.summary.model} from this report. Every finding it names was checked
            against the recorded findings; the cards below are the source of truth.
          </p>
        </div>
      ) : null}

      {report.findings.length + report.checks.length > 0 ? (
        <div className="flex flex-col gap-2 border-b border-border pb-3 sm:flex-row sm:flex-wrap sm:gap-4">
          <FilterGroup
            label="Platform"
            value={platform}
            onChange={setPlatform}
            options={[
              { value: "all", label: "All" },
              ...platforms.map((p) => ({
                value: p,
                label: platformShort(p),
                count: report.findings.filter((f) => f.platform === p).length,
              })),
            ]}
          />
          <FilterGroup
            label="Mode"
            value={mode}
            onChange={setMode}
            options={[
              { value: "all", label: "All" },
              ...modes.map((m) => ({
                value: m,
                label: modeLabel(m),
                count: report.findings.filter((f) => f.mode === m).length,
              })),
            ]}
          />
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <h3 className="text-sm font-semibold">
          Findings{" "}
          <span className="font-normal text-muted">
            {filtered ? `${findings.length} of ${report.findings.length}` : findings.length}
          </span>
        </h3>
        {findings.length === 0 ? (
          <p className="text-sm text-muted">
            {report.findings.length === 0
              ? "No findings on the screens that were reached. Checks below say what was and was not covered."
              : "No findings match these filters."}
          </p>
        ) : (
          findings.map((f) => (
            <FindingCard
              key={f.findingId}
              finding={f}
              focused={focusId === f.findingId}
              onShowEvidence={props.onShowEvidence}
            />
          ))
        )}
      </div>

      {checks.length > 0 ? (
        <div className="flex flex-col gap-2">
          <h3 className="text-sm font-semibold">Checks</h3>
          {checkModes.map((m) => (
            <div key={m} className="flex flex-col gap-1">
              {mode === "all" ? (
                <h4 className="text-xs font-semibold uppercase tracking-wide text-muted">
                  {modeLabel(m)}
                </h4>
              ) : null}
              <ul className="flex flex-col text-sm">
                {checks
                  .filter((c) => c.mode === m)
                  .map((c) => (
                    <li
                      key={`${c.platform}-${c.checkId}`}
                      className="flex flex-col gap-0.5 border-b border-border py-1.5 sm:flex-row sm:items-start sm:gap-3"
                    >
                      <span className="flex shrink-0 items-center gap-2 sm:w-80">
                        {c.storeStatus ? (
                          <Badge tone={STORE_STATUS[c.storeStatus]?.tone ?? "neutral"}>
                            {STORE_STATUS[c.storeStatus]?.label ?? c.storeStatus}
                          </Badge>
                        ) : (
                          <Badge tone={CHECK_STATUS[c.status]?.tone ?? "neutral"}>
                            {CHECK_STATUS[c.status]?.label ?? c.status}
                          </Badge>
                        )}
                        <span>
                          {checkName(c.checkId)}{" "}
                          <span className="text-xs text-muted">({platformShort(c.platform)})</span>
                        </span>
                      </span>
                      <span className="text-xs text-muted">
                        {c.summary}
                        {c.scope ? (
                          <span className="block opacity-80">Scope: {c.scope}</span>
                        ) : null}
                      </span>
                    </li>
                  ))}
              </ul>
            </div>
          ))}
        </div>
      ) : null}

      <ul className="list-disc pl-5 text-xs text-muted">
        {report.limitations.map((l) => (
          <li key={l}>{l}</li>
        ))}
      </ul>
    </section>
  );
}
