import {
  type CheckResult,
  type Finding,
  type PlatformResult,
  Report,
  type RunStatus,
  type SessionCounters,
  type TestMode,
  type VersionStamp,
} from "@tapscout/shared";

export interface SessionRecord {
  id: string;
  platform: "android" | "ios";
  phase: string;
  stopReason: string | null;
  phaseDetail: string | null;
  counters: Partial<SessionCounters>;
  /** PlatformResult sent by the runner in finish_session, when it got that far. */
  result: unknown;
  buildId: string;
}

const EMPTY_COUNTERS: SessionCounters = {
  screensObserved: 0,
  transitionsObserved: 0,
  actionsExecuted: 0,
  checksRun: 0,
  plannerCalls: 0,
  visionCalls: 0,
};

/**
 * Overall status from platform outcomes only: `completed` means the plan finished on every
 * platform, not that the app is bug-free; one failed platform makes the run `partial`.
 */
export function overallStatus(phases: string[], cancelled: boolean): RunStatus {
  if (cancelled) return "cancelled";
  const completed = phases.filter((p) => p === "completed").length;
  if (phases.length > 0 && completed === phases.length) return "completed";
  if (completed > 0) return "partial";
  if (phases.some((p) => p === "blocked")) return "partial";
  return "infrastructure_failed";
}

function platformResult(
  s: SessionRecord,
  checks: CheckResult[],
  findings: Finding[],
): PlatformResult {
  const reported = s.result as Partial<PlatformResult> | null;
  const blockers = [...(reported?.blockers ?? [])];
  if (s.phaseDetail && !blockers.includes(s.phaseDetail)) blockers.push(s.phaseDetail);
  return {
    platform: s.platform,
    sessionId: s.id,
    phase: s.phase as PlatformResult["phase"],
    stopReason: (s.stopReason ?? undefined) as PlatformResult["stopReason"],
    device: reported?.device,
    build: reported?.build ?? { buildId: s.buildId },
    counters: { ...EMPTY_COUNTERS, ...(reported?.counters ?? {}), ...s.counters },
    checks: checks.filter((c) => c.platform === s.platform),
    findingIds: findings.filter((f) => f.sessionId === s.id).map((f) => f.findingId),
    blockers,
  };
}

/** Deterministic report: every field comes from stored records; nothing is inferred by a model. */
export function buildReport(input: {
  runId: string;
  reportVersion: number;
  modes: TestMode[];
  versions: VersionStamp;
  cancelled: boolean;
  sessions: SessionRecord[];
  checks: CheckResult[];
  findings: Finding[];
  now?: Date;
}): Report {
  const platforms = input.sessions.map((s) => platformResult(s, input.checks, input.findings));
  const limitations = [
    "iOS evidence comes from the iOS Simulator, not a physical device.",
    "Results apply only to the screens and states that were actually reached in this run.",
    "No coverage percentage is reported because the total size of the app is unknown.",
  ];
  for (const p of platforms) {
    const name = p.platform === "ios" ? "iOS" : "Android";
    for (const b of p.blockers) {
      if (/^(Sign-in|Access blocked)/.test(b)) limitations.push(`${name}: ${b}`.slice(0, 400));
    }
    if (p.phase !== "completed") {
      limitations.push(
        `${p.platform === "ios" ? "iOS" : "Android"} did not complete (${p.phase.replace(/_/g, " ")}); its checks are incomplete.`,
      );
    }
  }
  return Report.parse({
    runId: input.runId,
    reportVersion: input.reportVersion,
    generatedAt: (input.now ?? new Date()).toISOString(),
    overallStatus: overallStatus(
      platforms.map((p) => p.phase),
      input.cancelled,
    ),
    modes: input.modes,
    platforms,
    findings: input.findings,
    correlations: [],
    summary: null,
    limitations,
    versions: input.versions,
  });
}
