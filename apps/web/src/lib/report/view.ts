import { CheckResult, Finding, formatReproduction, ReportSummary } from "@tapscout/shared";
import { z } from "zod";
import { orderFindings } from "./summary";

export interface CheckView {
  platform: "android" | "ios";
  checkId: string;
  mode: string;
  status: string;
  storeStatus?: string;
  summary: string;
  scope: string;
}

export interface FindingView {
  findingId: string;
  /** `F1`, `F2`… in display order; the same labels the model summary was given. */
  label: string;
  platform: "android" | "ios";
  mode: string;
  title: string;
  severity: string;
  severityRationale: string;
  verification: string;
  reproduction: string;
  confidence: string;
  evidenceKind: string;
  expected: string;
  observed: string;
  basis: string;
  conditions: string[];
  replay: {
    precondition: string;
    steps: { description: string; locator?: string }[];
    perturbation?: string;
    observe: string;
  } | null;
  evidence: { artifactId: string; role: string }[];
}

export interface SummaryView {
  text: string;
  model: string;
  /** Label → finding id, only for labels that were validated against the records. */
  refs: Record<string, string>;
}

export interface ReportView {
  /** What limited each platform (sign-in walls, infrastructure), shown before everything else. */
  blockers: { platform: "android" | "ios"; text: string }[];
  checks: CheckView[];
  findings: FindingView[];
  summary: SummaryView | null;
}

const Stored = z.object({
  platforms: z
    .array(
      z.object({
        platform: z.enum(["android", "ios"]).optional(),
        checks: z.array(z.unknown()).default([]),
        blockers: z.array(z.string()).default([]),
      }),
    )
    .default([]),
  findings: z.array(z.unknown()).default([]),
  summary: z.unknown().optional(),
});

/**
 * Report data as stored → what the run page shows. Entries that do not match the current
 * contract are skipped rather than guessed; a summary is shown only if its references were
 * validated when the report was saved.
 */
export function reportView(data: unknown): ReportView {
  const stored = Stored.safeParse(data);
  if (!stored.success) return { blockers: [], checks: [], findings: [], summary: null };
  const checks = stored.data.platforms.flatMap((p) =>
    p.checks.flatMap((c) => {
      const r = CheckResult.safeParse(c);
      return r.success
        ? [
            {
              platform: r.data.platform,
              checkId: r.data.checkId,
              mode: r.data.mode,
              status: r.data.status,
              storeStatus: r.data.storeStatus,
              summary: r.data.summary,
              scope: r.data.scope,
            },
          ]
        : [];
    }),
  );
  const parsed = stored.data.findings.flatMap((f) => {
    const r = Finding.safeParse(f);
    return r.success ? [r.data] : [];
  });
  const findings = orderFindings(parsed).map((f, i) => ({
    findingId: f.findingId,
    label: `F${i + 1}`,
    platform: f.platform,
    mode: f.mode,
    title: f.title,
    severity: f.severity,
    severityRationale: f.severityRationale,
    verification: f.verification,
    reproduction: formatReproduction(f.reproduction),
    confidence: f.confidence,
    evidenceKind: f.evidenceKind,
    expected: f.expected,
    observed: f.observed,
    basis: f.expectationBasis,
    conditions: f.conditions,
    replay: f.replay
      ? {
          precondition: f.replay.precondition,
          steps: [...f.replay.path]
            .sort((a, b) => a.index - b.index)
            .map((s) => ({ description: s.description, locator: s.locator })),
          perturbation: f.replay.perturbation,
          observe: f.replay.observe,
        }
      : null,
    evidence: f.evidence.map((e) => ({ artifactId: e.artifactId, role: e.role })),
  }));
  const summary = ReportSummary.safeParse(stored.data.summary);
  const known = new Set(findings.map((f) => f.findingId));
  const blockers = stored.data.platforms.flatMap((p) =>
    p.platform
      ? p.blockers.map((text) => ({ platform: p.platform as "android" | "ios", text }))
      : [],
  );
  return {
    blockers,
    checks,
    findings,
    summary:
      summary.success && summary.data.referencesValidated
        ? {
            text: summary.data.text,
            model: summary.data.model,
            refs: Object.fromEntries(
              Object.entries(summary.data.findingRefs).filter(([, id]) => known.has(id)),
            ),
          }
        : null,
  };
}
