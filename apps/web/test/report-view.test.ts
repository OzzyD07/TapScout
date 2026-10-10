import { describe, expect, it } from "vitest";
import { reportView } from "../src/lib/report/view";

const versions = {
  agent: "a",
  prompt: "p",
  checkPack: "c",
  rulePack: "none",
  budget: "b",
  plannerModel: "m",
};

function finding(id: string, severity: string) {
  return {
    findingId: id,
    runId: "r",
    sessionId: "s",
    platform: "ios",
    mode: "functional",
    title: `Finding ${id}`,
    expected: "kept",
    observed: "lost",
    expectationBasis: "observed_invariant",
    evidenceKind: "measured",
    verification: "reproduced",
    reproduction: { target: 2, started: 3, valid: 2, symptom: 2, blocked: [{ reason: "budget" }] },
    confidence: "high",
    severity,
    severityRationale: "x",
    evidence: [{ artifactId: "shot-1", role: "before" }],
    versions,
    createdAt: "2026-10-10T12:00:00.000Z",
  };
}

describe("reportView", () => {
  it("maps checks and findings, most severe first, with the n/m label", () => {
    const view = reportView({
      platforms: [
        {
          checks: [
            {
              checkId: "functional.persistence",
              mode: "functional",
              platform: "ios",
              status: "failed",
              summary: "Lost after relaunch",
              scope: "Profile",
            },
            { nonsense: true },
          ],
        },
      ],
      findings: [finding("low-1", "low"), finding("high-1", "high"), { broken: 1 }],
    });
    expect(view.checks).toEqual([
      expect.objectContaining({ checkId: "functional.persistence", status: "failed" }),
    ]);
    expect(view.findings.map((f) => f.findingId)).toEqual(["high-1", "low-1"]);
    expect(view.findings[0]?.reproduction).toBe("Reproduced 2/2; one blocked attempt");
  });

  it("returns empty lists for reports from before checks existed", () => {
    const empty = { checks: [], findings: [], summary: null };
    expect(reportView({ limitations: [] })).toEqual(empty);
    expect(reportView(null)).toEqual(empty);
  });

  it("labels findings in summary order and keeps replay steps in index order", () => {
    const withReplay = {
      ...finding("high-1", "high"),
      replay: {
        precondition: "Profile reachable",
        resets: ["app_process"],
        path: [
          { index: 1, description: "Tap 'Save'", locator: "edit-save" },
          { index: 0, description: "Open 'Edit profile'" },
        ],
        observe: "Value still shown",
      },
    };
    const view = reportView({ findings: [finding("low-1", "low"), withReplay] });
    expect(view.findings.map((f) => [f.label, f.findingId])).toEqual([
      ["F1", "high-1"],
      ["F2", "low-1"],
    ]);
    expect(view.findings[0]?.replay?.steps).toEqual([
      { description: "Open 'Edit profile'", locator: undefined },
      { description: "Tap 'Save'", locator: "edit-save" },
    ]);
    expect(view.findings[1]?.replay).toBeNull();
  });

  it("shows only a validated summary, and only links to findings of this report", () => {
    const summary = {
      text: "Data loss [F1].",
      model: "m",
      referencesValidated: true,
      findingRefs: { F1: "high-1", F9: "gone" },
    };
    const data = { findings: [finding("high-1", "high")], summary };
    expect(reportView(data).summary).toEqual({
      text: "Data loss [F1].",
      model: "m",
      refs: { F1: "high-1" },
    });
    expect(
      reportView({ ...data, summary: { ...summary, referencesValidated: false } }).summary,
    ).toBeNull();
    expect(reportView({ ...data, summary: null }).summary).toBeNull();
  });
});
