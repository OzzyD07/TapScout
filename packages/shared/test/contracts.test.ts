import { describe, expect, it } from "vitest";
import {
  CreateRunRequest,
  describeAction,
  formatReproduction,
  PlannerOutput,
  Reproduction,
  RunEventInput,
  responseJsonSchema,
} from "../src/index.js";

describe("PlannerOutput", () => {
  it("accepts the example from docs/03 §5.1", () => {
    const parsed = PlannerOutput.parse({
      schemaVersion: "1",
      goalId: "edit-profile",
      observationId: "obs-42",
      nextAction: { type: "tap", targetRef: "el-9" },
      expectedObservation: {
        kind: "state_change",
        basis: "ui_semantics",
        description: "Profile editing controls become visible.",
      },
      decisionSummary: "Open the discovered profile editor.",
    });
    expect(parsed.proposedGoals).toEqual([]);
  });

  it("rejects unknown action types and out-of-range parameters", () => {
    const base = {
      schemaVersion: "1",
      goalId: "g",
      observationId: "obs-1",
      expectedObservation: { kind: "state_change", basis: "heuristic", description: "x" },
      decisionSummary: "x",
    };
    expect(
      PlannerOutput.safeParse({ ...base, nextAction: { type: "shell", cmd: "rm -rf /" } }).success,
    ).toBe(false);
    expect(
      PlannerOutput.safeParse({
        ...base,
        nextAction: { type: "rapid_tap", targetRef: "el-1", count: 50 },
      }).success,
    ).toBe(false);
  });

  it("exports a JSON schema for the provider", () => {
    const schema = responseJsonSchema("planner_output_v1");
    expect(schema.type).toBe("object");
    expect(JSON.stringify(schema)).toContain("nextAction");
  });
});

describe("Reproduction", () => {
  it("formats the docs/03 §7 example", () => {
    const r = Reproduction.parse({
      target: 3,
      started: 3,
      valid: 2,
      symptom: 1,
      blocked: [{ reason: "reset_failed" }],
    });
    expect(formatReproduction(r)).toBe("Reproduced 1/2; one blocked attempt");
  });

  it("keeps the first observation when no valid replay completed", () => {
    const r = Reproduction.parse({
      target: 3,
      started: 1,
      valid: 0,
      symptom: 0,
      blocked: [{ reason: "budget" }],
    });
    expect(formatReproduction(r)).toBe("Observed; reproduction incomplete; one blocked attempt");
  });

  it("rejects impossible counts", () => {
    expect(Reproduction.safeParse({ target: 3, started: 2, valid: 2, symptom: 3 }).success).toBe(
      false,
    );
    expect(
      Reproduction.safeParse({
        target: 3,
        started: 2,
        valid: 2,
        symptom: 1,
        blocked: [{ reason: "budget" }],
      }).success,
    ).toBe(false);
  });
});

describe("RunEventInput", () => {
  it("validates payload by event type", () => {
    const base = {
      eventId: "7f1c1b7e-4f43-4b7a-9d38-6c2c2d0a9f11",
      runId: "run-1",
      sessionId: "ses-1",
      attemptId: "att-1",
      clientSequence: 3,
      occurredAt: "2026-10-06T12:00:00Z",
      phase: "exploring",
    };
    expect(
      RunEventInput.safeParse({ ...base, type: "stopped", payload: { reason: "budget_exhausted" } })
        .success,
    ).toBe(true);
    expect(
      RunEventInput.safeParse({ ...base, type: "stopped", payload: { reason: "bored" } }).success,
    ).toBe(false);
  });
});

describe("CreateRunRequest", () => {
  it("requires a platform and unique modes", () => {
    expect(CreateRunRequest.safeParse({ builds: {}, modes: ["functional"] }).success).toBe(false);
    expect(
      CreateRunRequest.safeParse({ builds: { android: "b1" }, modes: ["functional", "functional"] })
        .success,
    ).toBe(false);
    expect(
      CreateRunRequest.safeParse({
        builds: { android: "b1", ios: "b2" },
        modes: ["functional", "ui_ux"],
      }).success,
    ).toBe(true);
  });
});

describe("describeAction", () => {
  it("never echoes credential values", () => {
    expect(
      describeAction(
        {
          type: "type",
          targetRef: "el-1",
          input: { kind: "credential_ref", key: "password" },
          submit: false,
        },
        "Password",
      ),
    ).toBe('Type test credential into "Password"');
  });
});
