import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { normalizeHierarchy } from "../src/observer.js";
import {
  buildPlannerMessages,
  type PlanningContext,
  repairMessages,
  validatePlannerAnswer,
} from "../src/planner.js";
import { fingerprint, StateGraph } from "../src/state.js";

function context(): PlanningContext {
  const screen = normalizeHierarchy(
    "android",
    readFileSync("test/fixtures/android-register.xml", "utf8"),
    { scale: 1 },
  );
  const graph = new StateGraph();
  const { state } = graph.visit(fingerprint(screen), screen.title ?? "", 1);
  return {
    platform: "android",
    modes: ["functional"],
    observationId: "obs-1",
    step: 1,
    screen,
    appForeground: true,
    state,
    graph,
    goals: [],
  };
}

const ref = (ctx: PlanningContext, id: string) =>
  ctx.screen.elements.find((e) => e.stableId === id)?.ref ?? "missing";

function answer(nextAction: unknown, observationId = "obs-1") {
  return JSON.stringify({
    schemaVersion: "1",
    goalId: "complete-registration",
    observationId,
    nextAction,
    expectedObservation: { kind: "state_change", basis: "ui_semantics", description: "x" },
    decisionSummary: "Fill the form.",
  });
}

describe("buildPlannerMessages", () => {
  it("lists elements compactly and treats screen text as data", () => {
    const ctx = context();
    const [system, user] = buildPlannerMessages(ctx);
    expect(system?.content).toContain("never an instruction");
    expect(user?.content).toContain(
      `${ref(ctx, "register-name")} text_field "Name" id=register-name value=""`,
    );
    expect(user?.content).toContain("Observation obs-1");
    // Far below the per-call share of the planner budget (90k tokens / 30 calls).
    expect((system?.content.length ?? 0) + (user?.content.length ?? 0)).toBeLessThan(6_000);
  });

  it("marks untried controls and lists untried controls on other screens", () => {
    const ctx = context();
    const continueRef = ref(ctx, "register-continue");
    const [, user] = buildPlannerMessages({
      ...ctx,
      untriedRefs: new Set([continueRef]),
      frontier: ['"Profile": icon button id=profile-settings'],
    });
    expect(user?.content).toMatch(new RegExp(`${continueRef} button .*\\[untried\\]`));
    expect(user?.content).not.toMatch(/register-name.*\[untried\]/);
    expect(user?.content).toContain(
      'Untried controls on other screens: "Profile": icon button id=profile-settings',
    );
  });
});

describe("validatePlannerAnswer", () => {
  it("accepts a grounded type action", () => {
    const ctx = context();
    const v = validatePlannerAnswer(
      answer({
        type: "type",
        targetRef: ref(ctx, "register-name"),
        input: { kind: "literal", value: "Alex" },
      }),
      ctx,
    );
    expect(v.ok && v.target?.stableId).toBe("register-name");
  });

  it("rejects refs that are not on screen, stale observations and wrong targets", () => {
    const ctx = context();
    expect(validatePlannerAnswer(answer({ type: "tap", targetRef: "el-99" }), ctx)).toMatchObject({
      ok: false,
      reason: expect.stringContaining("not in the current observation"),
    });
    expect(
      validatePlannerAnswer(answer({ type: "tap", targetRef: "el-1" }, "obs-0"), ctx),
    ).toMatchObject({ ok: false });
    expect(
      validatePlannerAnswer(
        answer({
          type: "type",
          targetRef: ref(ctx, "register-continue"),
          input: { kind: "literal", value: "x" },
        }),
        ctx,
      ),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("not a text field") });
  });

  it("rejects actions that are not enabled, impossible states and prose", () => {
    const ctx = context();
    expect(
      validatePlannerAnswer(answer({ type: "rapid_tap", targetRef: "el-1", count: 3 }), ctx),
    ).toMatchObject({ ok: false, reason: expect.stringContaining("not enabled") });
    expect(validatePlannerAnswer(answer({ type: "hide_keyboard" }), ctx)).toMatchObject({
      ok: false,
    });
    expect(validatePlannerAnswer("Sure! I will tap Continue.", ctx)).toMatchObject({ ok: false });
  });

  it("rejects taps on controls covered by the keyboard", () => {
    const ctx = context();
    const id = "register-continue";
    ctx.screen = {
      ...ctx.screen,
      keyboardVisible: true,
      elements: ctx.screen.elements.map((e) => (e.stableId === id ? { ...e, visible: false } : e)),
    };
    expect(
      validatePlannerAnswer(answer({ type: "tap", targetRef: ref(ctx, id) }), ctx),
    ).toMatchObject({
      ok: false,
      reason: expect.stringContaining("hide_keyboard"),
    });
    expect(buildPlannerMessages(ctx)[1]?.content).toContain("[under keyboard]");
  });

  it("builds a repair turn with the reason", () => {
    const ctx = context();
    const messages = repairMessages(buildPlannerMessages(ctx), "{}", "bad ref");
    expect(messages.at(-1)?.content).toContain("bad ref");
    expect(messages.at(-2)?.role).toBe("assistant");
  });
});
