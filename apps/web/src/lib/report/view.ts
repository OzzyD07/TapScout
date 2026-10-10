import { CheckResult, Finding, formatReproduction } from "@tapscout/shared";
import { z } from "zod";

export interface CheckView {
  platform: "android" | "ios";
  checkId: string;
  mode: string;
  status: string;
  summary: string;
  scope: string;
}

export interface FindingView {
  findingId: string;
  platform: "android" | "ios";
  title: string;
  severity: string;
  verification: string;
  reproduction: string;
  expected: string;
  observed: string;
  basis: string;
  evidence: { artifactId: string; role: string }[];
}

const Stored = z.object({
  platforms: z.array(z.object({ checks: z.array(z.unknown()).default([]) })).default([]),
  findings: z.array(z.unknown()).default([]),
});

/**
 * Report data as stored → what the run page shows. Entries that do not match the current
 * contract are skipped rather than guessed.
 */
export function reportView(data: unknown): { checks: CheckView[]; findings: FindingView[] } {
  const stored = Stored.safeParse(data);
  if (!stored.success) return { checks: [], findings: [] };
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
              summary: r.data.summary,
              scope: r.data.scope,
            },
          ]
        : [];
    }),
  );
  const severityOrder = ["critical", "high", "medium", "low", "info"];
  const findings = stored.data.findings
    .flatMap((f) => {
      const r = Finding.safeParse(f);
      return r.success ? [r.data] : [];
    })
    .sort((a, b) => severityOrder.indexOf(a.severity) - severityOrder.indexOf(b.severity))
    .map((f) => ({
      findingId: f.findingId,
      platform: f.platform,
      title: f.title,
      severity: f.severity,
      verification: f.verification,
      reproduction: formatReproduction(f.reproduction),
      expected: f.expected,
      observed: f.observed,
      basis: f.expectationBasis,
      evidence: f.evidence.map((e) => ({ artifactId: e.artifactId, role: e.role })),
    }));
  return { checks, findings };
}
