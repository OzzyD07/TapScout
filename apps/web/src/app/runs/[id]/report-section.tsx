"use client";

import { MODES } from "@tapscout/shared";
import { useEffect, useMemo, useState } from "react";
import {
  AlertIcon,
  ChevronDownIcon,
  EyeIcon,
  InfoIcon,
  ListIcon,
  ShieldIcon,
  SparkIcon,
} from "@/components/icons";
import { Badge, Card, platformShort, runTone, Stat, Tag } from "@/components/ui";
import type { CheckView, FindingView, ReportView, SummaryView } from "@/lib/report/view";
import { phaseLabel, phaseTone, runStatusLabel, type Tone } from "@/lib/runs/timeline";
import { ScreenMapSection } from "./screen-map";

export interface ReportSnapshot {
  overallStatus: string;
  createdAt: string;
  limitations: string[];
  blockers: { platform: "android" | "ios"; text: string }[];
  checks: CheckView[];
  findings: FindingView[];
  summary: SummaryView | null;
  maps: ReportView["maps"];
  coverage: ReportView["coverage"];
}

/** Why a platform session stopped, in the user's words. */
const STOP_REASON: Record<string, string> = {
  goals_exhausted: "Everything reachable was tried",
  budget_exhausted: "Time or model budget used up",
  access_blocked: "Stopped at a sign-in or access wall",
  unsupported: "Build not supported",
  cancelled: "Cancelled",
  infrastructure_failed: "Device or runner failure",
};

const CHECK_STATUS: Record<string, { label: string; tone: Tone }> = {
  passed_within_scope: { label: "Passed (within scope)", tone: "ok" },
  failed: { label: "Failed", tone: "danger" },
  inconclusive: { label: "Inconclusive", tone: "warn" },
  not_tested: { label: "Not tested", tone: "neutral" },
  unsupported: { label: "Unsupported", tone: "neutral" },
};

/** Model review of a heuristic finding (docs/07 B11). */
const REVIEW: Record<string, { label: string; tone: Tone }> = {
  likely_true: { label: "Model review: likely real", tone: "ok" },
  needs_review: { label: "Model review: unsure", tone: "neutral" },
  likely_false: { label: "Model review: likely not a problem — check manually", tone: "warn" },
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

const SEVERITY_STRIPE: Record<string, string> = {
  critical: "bg-danger",
  high: "bg-danger",
  medium: "bg-warn",
  low: "bg-border-strong",
  info: "bg-border-strong",
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
    <div role="group" aria-label={props.label} className="flex flex-wrap items-center gap-1">
      <span className="mr-1 text-xs text-muted">{props.label}</span>
      {props.options.map((o) => (
        <button
          key={o.value}
          type="button"
          aria-pressed={props.value === o.value}
          onClick={() => props.onChange(o.value)}
          className={`inline-flex h-7 items-center gap-1.5 rounded-md px-2.5 text-xs font-medium transition-colors ${
            props.value === o.value
              ? "bg-text text-bg"
              : "border border-border text-muted hover:bg-surface-2 hover:text-text"
          }`}
        >
          {o.label}
          {o.count !== undefined ? (
            <span className="font-mono text-[11px] opacity-70">{o.count}</span>
          ) : null}
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
            className="mx-0.5 rounded border border-accent/25 bg-accent/10 px-1 py-px font-mono text-xs font-semibold text-accent hover:bg-accent/20"
          >
            {label}
          </a>
        );
      })}
    </p>
  );
}

/** "Symptom screenshot", or "Symptom 2" when a finding has several of one kind. */
function evidenceLabel(all: FindingView["evidence"], i: number): string {
  const role = all[i]?.role ?? "evidence";
  const name = role.charAt(0).toUpperCase() + role.slice(1);
  const same = all.filter((e) => e.role === role);
  if (same.length < 2) return `${name} screenshot`;
  return `${name} ${all.slice(0, i + 1).filter((e) => e.role === role).length}`;
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
      className={`relative flex scroll-mt-24 flex-col gap-3 overflow-hidden rounded-lg border bg-surface py-3 pr-4 pl-5 text-sm transition-shadow ${
        props.focused ? "border-accent ring-3 ring-accent/25" : "border-border"
      }`}
    >
      <span
        className={`absolute top-0 bottom-0 left-0 w-1 ${SEVERITY_STRIPE[f.severity] ?? "bg-border"}`}
      />
      <div className="flex flex-col gap-1.5">
        <div className="flex flex-wrap items-center gap-2">
          <span className="font-mono text-xs font-semibold text-muted">{f.label}</span>
          <Badge tone={SEVERITY_TONE[f.severity] ?? "neutral"}>{f.severity}</Badge>
          {f.verification === "manual_review_required" ? (
            <Badge tone="warn">needs manual check</Badge>
          ) : null}
        </div>
        <h4 className="font-semibold leading-snug">{f.title}</h4>
        <div className="flex flex-wrap gap-1.5">
          <Tag>{platformShort(f.platform)}</Tag>
          <Tag>{modeLabel(f.mode)}</Tag>
          <Tag>{f.reproduction}</Tag>
        </div>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <div className="rounded-md bg-surface-2/60 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Expected</p>
          <p className="mt-0.5">{f.expected}</p>
        </div>
        <div className="rounded-md bg-surface-2/60 px-3 py-2">
          <p className="text-[11px] font-medium uppercase tracking-wide text-muted">Observed</p>
          <p className="mt-0.5">{f.observed}</p>
        </div>
      </div>

      <p className="text-xs text-muted">
        <span className="text-text">{EVIDENCE_KIND[f.evidenceKind] ?? f.evidenceKind}</span> ·{" "}
        {f.confidence} confidence · basis: {f.basis.replace(/_/g, " ")}
        {f.conditions.length > 0 ? ` · ${f.conditions.join(", ")}` : ""}
        <br />
        Why {f.severity}: {f.severityRationale}
      </p>

      {f.review ? (
        <div className="flex flex-col gap-1.5 rounded-md border border-border px-3 py-2 text-xs sm:flex-row sm:items-start sm:gap-2">
          <Badge tone={REVIEW[f.review.verdict]?.tone ?? "neutral"}>
            {REVIEW[f.review.verdict]?.label ?? f.review.verdict}
          </Badge>
          <span className="text-muted sm:pt-1">{f.review.reason}</span>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        {f.replay ? (
          <details className="group/steps w-full text-xs">
            <summary className="inline-flex cursor-pointer list-none items-center gap-1 font-medium text-text [&::-webkit-details-marker]:hidden">
              <ChevronDownIcon
                size={13}
                className="-rotate-90 text-muted transition-transform group-open/steps:rotate-0"
              />
              Steps to reproduce ({f.replay.steps.length})
            </summary>
            <div className="mt-2 flex flex-col gap-1.5 rounded-md border border-border bg-surface-2/40 px-3 py-2.5 text-muted">
              <p>
                <span className="font-medium text-text">Start:</span> {f.replay.precondition}
              </p>
              <ol className="flex list-decimal flex-col gap-0.5 pl-5">
                {f.replay.steps.map((s, i) => (
                  // biome-ignore lint/suspicious/noArrayIndexKey: steps are an ordered, immutable list
                  <li key={i}>
                    {s.description}
                    {s.locator ? (
                      <code className="ml-1.5 rounded bg-surface px-1 font-mono text-[11px] text-text">
                        {s.locator}
                      </code>
                    ) : null}
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
          <div className="flex flex-wrap gap-2 text-xs">
            {f.evidence.map((e, i) =>
              e.role === "log" ? (
                // A crash log (text) opens on its own through the signed-URL redirect.
                <a
                  // biome-ignore lint/suspicious/noArrayIndexKey: the same artifact can appear in two roles
                  key={`${e.artifactId}-${i}`}
                  href={`/api/artifacts/${e.artifactId}`}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 font-medium hover:bg-surface-2"
                >
                  <ListIcon size={12} /> Crash log
                </a>
              ) : (
                <button
                  // biome-ignore lint/suspicious/noArrayIndexKey: the same artifact can appear in two roles
                  key={`${e.artifactId}-${i}`}
                  type="button"
                  className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2.5 font-medium hover:bg-surface-2"
                  onClick={() => props.onShowEvidence(f.platform, e.artifactId)}
                >
                  <EyeIcon size={12} /> {evidenceLabel(f.evidence, i)}
                </button>
              ),
            )}
          </div>
        ) : null}
      </div>
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
  const serious = report.findings.filter((f) => f.severity === "critical" || f.severity === "high");
  const manual = report.findings.filter((f) => f.verification === "manual_review_required");
  const failedChecks = report.checks.filter((c) => c.status === "failed").length;
  const passedChecks = report.checks.filter((c) => c.status === "passed_within_scope").length;

  return (
    <Card as="section" className="overflow-hidden">
      <div className="flex flex-col gap-4 border-b border-border px-4 py-4 sm:px-5">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <span className="flex h-7 w-7 items-center justify-center rounded-md border border-border bg-surface-2 text-muted">
              <ShieldIcon size={14} />
            </span>
            <h2 className="text-base font-semibold">Report</h2>
            <Badge tone={runTone(report.overallStatus, false)} dot>
              {runStatusLabel(report.overallStatus, false)}
            </Badge>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {props.phases.map((p) => (
              <Badge key={p.platform} tone={phaseTone(p.phase)}>
                {platformShort(p.platform)}: {phaseLabel(p.phase)}
              </Badge>
            ))}
          </div>
        </div>
        <dl className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          <Stat label="Findings" value={report.findings.length} />
          <Stat
            label="High or critical"
            value={serious.length}
            tone={serious.length > 0 ? "danger" : "neutral"}
          />
          <Stat
            label="Checks failed"
            value={failedChecks}
            tone={failedChecks > 0 ? "warn" : "neutral"}
          />
          <Stat
            label="Checks passed"
            value={passedChecks}
            tone={passedChecks > 0 ? "ok" : "neutral"}
          />
        </dl>
        {report.coverage.length > 0 ? (
          <div className="overflow-x-auto rounded-lg border border-border">
            <table className="w-full min-w-[520px] text-left text-xs">
              <caption className="sr-only">What each platform session covered</caption>
              <thead className="bg-surface-2/60 text-muted">
                <tr>
                  <th className="px-3 py-1.5 font-medium">Platform</th>
                  <th className="px-3 py-1.5 text-right font-medium">Screens</th>
                  <th className="px-3 py-1.5 text-right font-medium">Moves</th>
                  <th className="px-3 py-1.5 text-right font-medium">Actions</th>
                  <th className="px-3 py-1.5 text-right font-medium">Model calls</th>
                  <th className="px-3 py-1.5 font-medium">Stopped because</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {report.coverage.map((c) => (
                  <tr key={c.platform}>
                    <td className="px-3 py-2 font-medium">{platformShort(c.platform)}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{c.screens}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{c.transitions}</td>
                    <td className="px-3 py-2 text-right font-mono tabular-nums">{c.actions}</td>
                    <td
                      className="px-3 py-2 text-right font-mono tabular-nums"
                      title={`${c.plannerCalls} planner · ${c.visionCalls} vision`}
                    >
                      {c.plannerCalls + c.visionCalls}
                    </td>
                    <td className="px-3 py-2 text-muted">
                      {c.stopReason
                        ? (STOP_REASON[c.stopReason] ?? c.stopReason.replace(/_/g, " "))
                        : phaseLabel(c.phase)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </div>

      <div className="flex flex-col gap-6 px-4 py-5 sm:px-5">
        {report.blockers.length > 0 ? (
          <div
            role="note"
            className="flex gap-3 rounded-lg border border-warn/30 bg-warn/10 p-3 text-sm"
          >
            <AlertIcon size={16} className="mt-0.5 shrink-0 text-warn" />
            <div className="flex flex-col gap-1.5">
              <h3 className="font-semibold">What limited this run</h3>
              <ul className="flex flex-col gap-1">
                {report.blockers.map((b) => (
                  <li key={`${b.platform}-${b.text}`}>
                    <span className="font-medium">{platformShort(b.platform)}:</span> {b.text}
                  </li>
                ))}
              </ul>
              <p className="text-xs text-muted">
                Checks below apply only to the screens reached; nothing behind these walls was
                tested.
              </p>
            </div>
          </div>
        ) : null}

        {report.summary ? (
          <div className="flex flex-col gap-2 rounded-lg border border-accent/25 bg-accent/5 p-4">
            <h3 className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-accent">
              <SparkIcon size={13} /> Summary
            </h3>
            <SummaryText
              summary={report.summary}
              onJump={(id) => {
                setPlatform("all");
                setMode("all");
                setFocusId(id);
              }}
            />
            <p className="text-xs text-muted">
              Written by <span className="font-mono">{report.summary.model}</span> from this report.
              Every finding it names was checked against the recorded findings; the cards below are
              the source of truth.
            </p>
          </div>
        ) : null}

        <ScreenMapSection maps={report.maps} onShowEvidence={props.onShowEvidence} />

        {report.findings.length + report.checks.length > 0 ? (
          <div className="flex flex-col gap-2 rounded-lg border border-border bg-surface-2/40 p-2.5 sm:flex-row sm:flex-wrap sm:items-center sm:gap-x-6">
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

        <div className="flex flex-col gap-3">
          <h3 className="flex items-baseline gap-2 text-sm font-semibold">
            Findings
            <span className="font-mono text-xs font-normal text-muted">
              {filtered ? `${findings.length} of ${report.findings.length}` : findings.length}
            </span>
            {manual.length > 0 ? (
              <span className="text-xs font-normal text-muted">
                · {manual.length} lowered to manual review, listed last
              </span>
            ) : null}
          </h3>
          {findings.length === 0 ? (
            <p className="flex items-start gap-2 rounded-lg border border-dashed border-border px-4 py-6 text-sm text-muted">
              <InfoIcon size={15} className="mt-0.5 shrink-0" />
              {report.findings.length === 0
                ? "No findings on the screens that were reached. The checks below say what was and was not covered."
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
          <div className="flex flex-col gap-3">
            <h3 className="text-sm font-semibold">Checks</h3>
            {checkModes.map((m) => (
              <div key={m} className="overflow-hidden rounded-lg border border-border">
                {mode === "all" ? (
                  <h4 className="border-b border-border bg-surface-2/60 px-3 py-1.5 text-xs font-medium text-muted">
                    {modeLabel(m)}
                  </h4>
                ) : null}
                <ul className="divide-y divide-border text-sm">
                  {checks
                    .filter((c) => c.mode === m)
                    .map((c) => (
                      <li
                        key={`${c.platform}-${c.checkId}`}
                        className="flex flex-col gap-1.5 px-3 py-2.5 sm:flex-row sm:items-start sm:gap-4"
                      >
                        <span className="flex shrink-0 items-center gap-2 sm:w-72">
                          {c.storeStatus ? (
                            <Badge tone={STORE_STATUS[c.storeStatus]?.tone ?? "neutral"} dot>
                              {STORE_STATUS[c.storeStatus]?.label ?? c.storeStatus}
                            </Badge>
                          ) : (
                            <Badge tone={CHECK_STATUS[c.status]?.tone ?? "neutral"} dot>
                              {CHECK_STATUS[c.status]?.label ?? c.status}
                            </Badge>
                          )}
                          <span className="font-medium">
                            {checkName(c.checkId)}{" "}
                            <span className="text-xs font-normal text-muted">
                              {platformShort(c.platform)}
                            </span>
                          </span>
                        </span>
                        <span className="text-xs leading-relaxed text-muted">
                          {c.summary}
                          {c.scope ? (
                            <span className="block text-faint">Scope: {c.scope}</span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                </ul>
              </div>
            ))}
          </div>
        ) : null}

        {report.limitations.length > 0 ? (
          <div className="flex flex-col gap-1.5 border-t border-border pt-4">
            <h3 className="text-xs font-medium uppercase tracking-wide text-muted">Limitations</h3>
            <ul className="flex list-disc flex-col gap-0.5 pl-5 text-xs text-muted">
              {report.limitations.map((l) => (
                <li key={l}>{l}</li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Card>
  );
}
