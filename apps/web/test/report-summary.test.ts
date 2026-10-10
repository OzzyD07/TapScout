import { type Finding, Report } from "@tapscout/shared";
import { describe, expect, it, vi } from "vitest";
import { buildReport } from "../src/lib/report/build";
import { summarizeReport, summaryInput, validateSummary } from "../src/lib/report/summary";

const RUN = "11111111-1111-4111-8111-111111111111";
const ANDROID = "22222222-2222-4222-8222-222222222222";
const IOS = "33333333-3333-4333-8333-333333333333";
const versions = {
  agent: "a",
  prompt: "p",
  checkPack: "c",
  rulePack: "r",
  budget: "b",
  plannerModel: "m",
};

function finding(over: Partial<Finding> & Pick<Finding, "findingId">): Finding {
  return {
    runId: RUN,
    sessionId: ANDROID,
    platform: "android",
    mode: "functional",
    title: "Saved About you is lost after the app restarts",
    expected: "kept",
    observed: "empty",
    expectationBasis: "observed_invariant",
    evidenceKind: "measured",
    verification: "reproduced",
    reproduction: { target: 2, started: 2, valid: 2, symptom: 2, blocked: [] },
    confidence: "high",
    severity: "high",
    severityRationale: "data loss",
    conditions: [],
    evidence: [],
    versions,
    createdAt: "2026-10-11T12:00:00.000Z",
    ...over,
  };
}

const lost = finding({ findingId: "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa" });
const icon = finding({
  findingId: "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb",
  sessionId: IOS,
  platform: "ios",
  mode: "accessibility",
  title: "Icon button has no accessible label",
  severity: "medium",
  verification: "observed",
  reproduction: { target: 0, started: 0, valid: 0, symptom: 0, blocked: [] },
});

function report(findings: Finding[]): Report {
  return buildReport({
    runId: RUN,
    reportVersion: 1,
    modes: ["functional", "accessibility"],
    versions,
    cancelled: false,
    sessions: [
      {
        id: ANDROID,
        platform: "android",
        phase: "completed",
        stopReason: "goals_exhausted",
        phaseDetail: null,
        counters: {},
        result: null,
        buildId: "b1",
      },
    ],
    checks: [],
    findings,
  });
}

describe("summaryInput", () => {
  it("labels findings most severe first and passes reproduction labels, not raw counts", () => {
    const { labels, data } = summaryInput(report([icon, lost]));
    expect([...labels.keys()]).toEqual(["F1", "F2"]);
    expect(labels.get("F1")?.findingId).toBe(lost.findingId);
    expect(JSON.stringify(data)).toContain("Reproduced 2/2");
    expect(JSON.stringify(data)).not.toContain(lost.findingId);
  });
});

describe("validateSummary", () => {
  const { labels } = summaryInput(report([icon, lost]));
  const check = (summary: string, refs: string[] = []) =>
    validateSummary({ summary, referencedFindingIds: refs }, labels);

  it("accepts text that only restates the records", () => {
    expect(
      check(
        "Saved profile text was lost after a restart on Android [F1] (Reproduced 2/2). " +
          "A medium-severity icon button lacks a label on iOS [F2].",
        ["F1", "F2"],
      ),
    ).toEqual({ ok: true, used: ["F1", "F2"] });
  });

  it.each([
    ["an unknown label", "The app crashed [F3].", []],
    ["an unknown referenced id", "Two issues were found.", ["F9"]],
    ["no label although the run has findings", "Two issues were found.", []],
    ["an invented ratio", "Data loss reproduced 3/3 times [F1].", []],
    ["an escalated severity", "A critical data loss bug [F1].", []],
    [
      "a severity list that sweeps in a lower finding",
      "High severity: data loss [F1]; no label [F2].",
      [],
    ],
    ["two problems grouped as one", "Data loss and a missing label [F1][F2].", []],
    ["a label pinned to two claims", "A crash [F1]. Data loss on both platforms [F1].", []],
    ["a one-platform finding claimed on both", "Data loss on both platforms [F1].", []],
    ["a finding on the wrong platform", "A label is missing on Android [F2].", []],
    ["a count that does not match the labels", "Two data loss incidents on Android [F1].", []],
    ["a pass claim", "Persistence passed on both platforms. One issue [F1].", []],
    ["a bug-free claim", "Apart from [F1] the app is bug-free.", []],
    ["a raw id", `See ${lost.findingId}.`, []],
    ["a URL", "Details at https://example.com.", []],
    ["empty text", "  ", []],
  ])("rejects %s", (_, summary, refs) => {
    expect(check(summary, refs).ok).toBe(false);
  });
});

describe("summarizeReport", () => {
  it("returns validated text with label → finding references", async () => {
    const model = vi.fn(async () => ({
      content: JSON.stringify({
        summary: "Saved text was lost after restart [F1] (Reproduced 2/2).",
        referencedFindingIds: ["F1"],
      }),
      model: "nvidia/Nemotron-3_5-Lightning",
    }));
    const summary = await summarizeReport(report([lost, icon]), model);
    expect(summary).toEqual({
      text: "Saved text was lost after restart [F1] (Reproduced 2/2).",
      model: "nvidia/Nemotron-3_5-Lightning",
      referencesValidated: true,
      findingRefs: { F1: lost.findingId },
    });
    // The finished report still matches the contract.
    expect(Report.safeParse({ ...report([lost, icon]), summary }).success).toBe(true);
  });

  it("retries with the rejection reason, then gives up", async () => {
    const model = vi.fn(async () => ({
      content: JSON.stringify({ summary: "Reproduced 5/5 [F1].", referencedFindingIds: ["F1"] }),
      model: "m",
    }));
    expect(await summarizeReport(report([lost]), model)).toBeNull();
    expect(model).toHaveBeenCalledTimes(3);
    const retry = model.mock.calls[2] as unknown as [{ role: string; content: string }[]];
    expect(retry[0].at(-1)?.content).toMatch(/^Rejected: the ratio 5\/5/);
  });

  it("returns null when the model call fails", async () => {
    const model = vi.fn(async () => {
      throw new Error("upstream");
    });
    expect(await summarizeReport(report([]), model)).toBeNull();
  });

  it("accepts a summary of a run without findings", async () => {
    const model = vi.fn(async () => ({
      content: JSON.stringify({
        summary: "No issues were found on the screens that were reached.",
        referencedFindingIds: [],
      }),
      model: "m",
    }));
    expect((await summarizeReport(report([]), model))?.findingRefs).toEqual({});
  });
});

describe("problem grouping", () => {
  it("groups one problem across platforms so its labels may be written together", () => {
    const iosLost = finding({
      findingId: "cccccccc-cccc-4ccc-8ccc-cccccccccccc",
      sessionId: IOS,
      platform: "ios",
    });
    const { labels, data } = summaryInput(report([lost, iosLost, icon]));
    expect((data as { problems: unknown[] }).problems).toHaveLength(2);
    expect(
      validateSummary(
        {
          summary: "Saved text is lost on Android and iOS [F1][F2] (Reproduced 2/2).",
          referencedFindingIds: [],
        },
        labels,
      ).ok,
    ).toBe(true);
  });
});
