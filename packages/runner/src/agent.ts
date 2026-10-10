// Agent loop (docs/03 §2): Observe → state graph → Plan (Nemotron via relay) → Validate → Act →
// Evaluate, one device action at a time, inside the platform budget. Cancellation and lease loss
// arrive through `checkpoint()`, which throws; normal endings return an outcome.

import {
  type ChatMessage,
  describeAction,
  type PlatformBudget,
  type ProposedAction,
  type ProposedGoal,
  type RelayResponse,
  type RunEventInput,
  type SessionCounters,
  type StopReason,
  type TestMode,
  type UiElement,
} from "@tapscout/shared";
import { RunnerApiError } from "./api.js";
import { type NormalizedScreen, normalizeHierarchy, type Platform, pngSize } from "./observer.js";
import {
  buildPlannerMessages,
  generatedText,
  type PlanningContext,
  repairMessages,
  validatePlannerAnswer,
} from "./planner.js";
import { actionKey, fingerprint, StateGraph } from "./state.js";

/** The subset of DeviceSession the loop uses; a fake implements it in tests. */
export interface AgentDevice {
  readonly platform: Platform;
  windowSize(): Promise<{ width: number; height: number }>;
  screenshotPng(): Promise<Buffer>;
  pageSource(): Promise<string>;
  keyboardShown(): Promise<boolean>;
  appState(appId: string): Promise<number>;
  appIdFromCapabilities(): string | undefined;
  find(
    hint: { testId?: string; label?: string },
    timeoutMs?: number,
  ): Promise<{ elementId: string } | null>;
  tap(target: { elementId: string }): Promise<void>;
  tapAt(x: number, y: number): Promise<void>;
  typeInto(target: { elementId: string }, text: string): Promise<void>;
  pressEnter(): Promise<void>;
  scroll(
    direction: "up" | "down" | "left" | "right",
    region?: { x: number; y: number; width: number; height: number },
  ): Promise<void>;
  back(): Promise<void>;
  hideKeyboard(): Promise<void>;
  relaunch(appId: string, clearData: boolean): Promise<void>;
}

type EventBody = Pick<RunEventInput, "type" | "payload"> & { stepIndex?: number };

export interface AgentPorts {
  device: AgentDevice;
  emit(event: EventBody): void;
  flush(): Promise<void>;
  /** Stores evidence and returns its artifact id. */
  saveEvidence(
    name: string,
    kind: "screenshot" | "hierarchy",
    data: Buffer | string,
    step: number,
  ): Promise<string>;
  plan(messages: ChatMessage[], purpose: "plan" | "repair"): Promise<RelayResponse>;
  vision(artifactId: string, prompt: string): Promise<RelayResponse>;
  /** Throws when the run was cancelled or the lease was lost. */
  checkpoint(): void;
  now(): number;
  sleep(ms: number): Promise<void>;
  log(message: string): void;
}

export interface AgentConfig {
  platform: Platform;
  modes: TestMode[];
  budget: PlatformBudget;
  /** Epoch ms after which no new QA or model work starts (docs/03 §9 soft stop). */
  softDeadline: number;
  counters: SessionCounters;
  /** How long to wait for the first usable app screen. */
  launchTimeoutMs?: number;
  settleMs?: number;
}

export interface AgentOutcome {
  phase: "completed" | "blocked";
  stopReason: StopReason;
  detail: string;
  blockers: string[];
  screens: number;
}

interface Snapshot {
  png: Buffer;
  xml: string;
  screen: NormalizedScreen;
  appForeground: boolean;
  /** Screenshot pixels per driver unit (1 on Android, display scale on iOS). */
  scale: number;
}

interface Pending {
  commandId: string;
  fromFp: string;
  key: string;
  summary: string;
  outcome: "ok" | "failed";
  durationMs: number;
  error?: string;
}

class AgentStop extends Error {
  constructor(readonly outcome: Omit<AgentOutcome, "screens">) {
    super(outcome.detail);
  }
}

const OFF_APP = "off-app";
const MAX_CONSECUTIVE_INTERRUPTIONS = 4;
const MAX_PLANNER_FAILURES = 3;
const MAX_RELAUNCHES = 3;
const VISION_PROMPT =
  "In at most two sentences: what screen of the app is this, and which main controls are visible?";

function keyOf(action: ProposedAction, target?: UiElement): string {
  return actionKey(action.type, target, action.type === "scroll" ? action.direction : "");
}

/** Appium errors after which the device session is gone; these end the session as infrastructure. */
function isSessionDead(error: unknown): boolean {
  return /invalid session id|session is either terminated|ECONNREFUSED|socket hang up|instrumentation process is not running/i.test(
    (error as Error)?.message ?? "",
  );
}

export async function runAgent(ports: AgentPorts, config: AgentConfig): Promise<AgentOutcome> {
  const { device } = ports;
  const { platform, budget, counters } = config;
  const graph = new StateGraph(budget.loopDetectionRepeats);
  const goals: ProposedGoal[] = [];
  let appId = device.appIdFromCapabilities();
  let window: { width: number; height: number } | null = null;

  const outcome = (o: Omit<AgentOutcome, "screens">): AgentOutcome => ({
    ...o,
    screens: graph.size,
  });

  async function observe(): Promise<Snapshot> {
    const png = await device.screenshotPng();
    const xml = await device.pageSource();
    window ??= await device.windowSize();
    const size = pngSize(png);
    const scale = platform === "ios" && size && window.width > 0 ? size.width / window.width : 1;
    const screen = normalizeHierarchy(platform, xml, { scale });
    if (platform === "android") screen.keyboardVisible = await device.keyboardShown();
    if (!appId && platform === "ios" && screen.topPackage) appId = screen.topPackage;
    const appForeground = appId ? (await device.appState(appId)) === 4 : true;
    return { png, xml, screen, appForeground, scale };
  }

  async function dismissInterruption(snap: Snapshot): Promise<void> {
    const it = snap.screen.interruption;
    if (!it) return;
    const b = it.dismiss.bounds;
    ports.emit({
      type: "note",
      payload: {
        level: "warn",
        message: `System dialog "${it.title || it.kind}" covered the app; tapped "${it.dismiss.label}".`,
      },
    });
    await device.tapAt((b.x + b.width / 2) / snap.scale, (b.y + b.height / 2) / snap.scale);
    await ports.sleep(1_500);
  }

  // ---- Preparation: wait for a usable first screen (system dialogs are dismissed, not explored).
  const launchDeadline = ports.now() + (config.launchTimeoutMs ?? 90_000);
  let first: Snapshot | null = null;
  let last: Snapshot | null = null;
  let interruptions = 0;
  while (ports.now() < launchDeadline) {
    ports.checkpoint();
    last = await observe();
    if (last.screen.interruption) {
      interruptions += 1;
      if (interruptions > MAX_CONSECUTIVE_INTERRUPTIONS * 2) break;
      await dismissInterruption(last);
      continue;
    }
    if (last.appForeground && last.screen.elements.length > 0) {
      first = last;
      break;
    }
    await ports.sleep(2_000);
  }
  if (!first) {
    if (last) {
      await ports.saveEvidence("launch-timeout", "screenshot", last.png, 0);
      await ports.saveEvidence("launch-timeout", "hierarchy", last.xml, 0);
    }
    return outcome({
      phase: "blocked",
      stopReason: "access_blocked",
      detail: "The app did not show a usable screen within the launch timeout.",
      blockers: [
        last?.screen.interruption
          ? `A system dialog kept covering the app: ${last.screen.interruption.title}`
          : "No app screen with interactive elements appeared after launch.",
      ],
    });
  }

  // ---- Planner call with one repair and bounded failures.
  let plannerFailures = 0;
  async function decide(ctx: PlanningContext) {
    let messages = buildPlannerMessages(ctx);
    for (let attempt = 0; attempt <= budget.maxRepairsPerDecision; attempt++) {
      if (counters.plannerCalls >= budget.maxPlannerRequests) {
        throw new AgentStop({
          phase: "completed",
          stopReason: "budget_exhausted",
          detail: "Planner request budget used up.",
          blockers: [],
        });
      }
      counters.plannerCalls += 1;
      let res: RelayResponse;
      try {
        res = await ports.plan(messages, attempt === 0 ? "plan" : "repair");
        plannerFailures = 0;
      } catch (error) {
        if (error instanceof RunnerApiError && error.code === "budget_exhausted") {
          throw new AgentStop({
            phase: "completed",
            stopReason: "budget_exhausted",
            detail: "Planner token budget used up.",
            blockers: [],
          });
        }
        if (
          error instanceof RunnerApiError &&
          (error.code === "lease_lost" || error.code === "unauthorized")
        ) {
          throw error;
        }
        plannerFailures += 1;
        ports.emit({
          type: "note",
          payload: {
            level: "warn",
            message: `Planner call failed: ${(error as Error).message.slice(0, 300)}`,
          },
        });
        if (plannerFailures >= MAX_PLANNER_FAILURES) {
          throw new AgentStop({
            phase: "completed",
            stopReason: "infrastructure_failed",
            detail: "The planner relay failed repeatedly.",
            blockers: ["Planner (Nemotron) calls failed repeatedly; exploration stopped early."],
          });
        }
        return null;
      }
      const verdict = validatePlannerAnswer(res.content, ctx);
      if (verdict.ok) return verdict;
      ports.emit({
        type: "note",
        payload: {
          level: "warn",
          message: `Planner proposal rejected: ${verdict.reason}`.slice(0, 500),
        },
      });
      messages = repairMessages(messages, res.content, verdict.reason);
    }
    return null;
  }

  /** Deterministic fallback: an untried control on this screen, else back. */
  function fallback(
    screen: NormalizedScreen,
    fp: string,
  ): { action: ProposedAction; target?: UiElement } {
    const tried = graph.get(fp)?.tried;
    const untried = screen.elements.find(
      (e) =>
        e.enabled &&
        (e.role === "button" || e.role === "link" || e.role === "tab" || e.role === "cell") &&
        !tried?.has(actionKey("tap", e)),
    );
    if (untried) return { action: { type: "tap", targetRef: untried.ref }, target: untried };
    return { action: { type: "back" } };
  }

  async function resolve(target: UiElement) {
    if (!target.stableId && !target.label && !target.text) return null;
    return device.find({ testId: target.stableId, label: target.label ?? target.text }, 2_500);
  }

  async function execute(action: ProposedAction, target: UiElement | undefined, snap: Snapshot) {
    const center = (e: UiElement) => ({
      x: (e.bounds.x + e.bounds.width / 2) / snap.scale,
      y: (e.bounds.y + e.bounds.height / 2) / snap.scale,
    });
    switch (action.type) {
      case "tap": {
        if (!target) throw new Error("tap without target");
        const found = await resolve(target);
        if (found) await device.tap(found);
        else {
          const p = center(target);
          await device.tapAt(p.x, p.y);
        }
        return;
      }
      case "type": {
        if (!target) throw new Error("type without target");
        const found = await resolve(target);
        if (!found) throw new Error("the text field could not be resolved on the current screen");
        await device.typeInto(found, generatedText(action.input));
        if (action.submit) await device.pressEnter();
        return;
      }
      case "scroll": {
        const region = target
          ? {
              x: Math.round(target.bounds.x / snap.scale),
              y: Math.round(target.bounds.y / snap.scale),
              width: Math.round(target.bounds.width / snap.scale),
              height: Math.round(target.bounds.height / snap.scale),
            }
          : undefined;
        await device.scroll(action.direction, region);
        return;
      }
      case "back":
        await device.back();
        return;
      case "hide_keyboard":
        await device.hideKeyboard();
        return;
      case "wait":
        await ports.sleep(action.milliseconds);
        return;
      case "relaunch":
        if (!appId) throw new Error("the app id is unknown");
        await device.relaunch(appId, action.clearData);
        return;
      default:
        throw new Error(`action ${action.type} is not enabled`);
    }
  }

  // ---- Main loop.
  let step = 0;
  let pending: Pending | null = null;
  let fresh: Snapshot | null = first;
  let consecutiveInterruptions = 0;
  let relaunches = 0;
  let stuckWarnings = 0;

  try {
    for (;;) {
      ports.checkpoint();
      const snap: Snapshot = fresh ?? (await observe());
      fresh = null;
      if (snap.screen.interruption) {
        consecutiveInterruptions += 1;
        if (consecutiveInterruptions > MAX_CONSECUTIVE_INTERRUPTIONS) {
          throw new AgentStop({
            phase: "completed",
            stopReason: "infrastructure_failed",
            detail: "A system dialog kept reappearing over the app.",
            blockers: [`System dialog kept reappearing: ${snap.screen.interruption.title}`],
          });
        }
        await dismissInterruption(snap);
        continue;
      }
      consecutiveInterruptions = 0;

      const observationId = `obs-${step}`;
      const shot = await ports.saveEvidence(`step-${step}`, "screenshot", snap.png, step);
      await ports.saveEvidence(`step-${step}`, "hierarchy", snap.xml, step);
      const fp = snap.appForeground ? fingerprint(snap.screen) : OFF_APP;
      const label = snap.appForeground ? (snap.screen.title ?? "") : "Outside the app";
      const { state, isNew } = graph.visit(fp, label, step);
      counters.screensObserved = graph.visited().filter((s) => s.fingerprint !== OFF_APP).length;

      if (pending) {
        graph.record(
          pending.fromFp,
          pending.key,
          pending.summary,
          snap.appForeground ? fp : null,
          step,
        );
        counters.transitionsObserved = graph.transitions;
        const result = graph.history.at(-1)?.result ?? "";
        ports.emit({
          type: "action_executed",
          stepIndex: step,
          payload: {
            commandId: pending.commandId,
            summary: pending.summary,
            outcome:
              pending.outcome === "failed" ? "failed" : snap.appForeground ? "ok" : "uncertain",
            durationMs: pending.durationMs,
            screenshotArtifactId: shot,
            resultSummary: (pending.error
              ? `Failed: ${pending.error}`
              : `Result: ${result}.`
            ).slice(0, 300),
          },
        });
        pending = null;
      }
      ports.emit({
        type: "observation",
        stepIndex: step,
        payload: {
          observationId,
          screenStateId: state.id,
          isNewState: isNew,
          elementCount: snap.screen.elements.length,
          screenshotArtifactId: shot,
        },
      });
      ports.emit({ type: "counters", payload: { ...counters } });
      await ports.flush();

      // Budget gates before any new QA or model work (docs/03 §9).
      if (ports.now() >= config.softDeadline) {
        return outcome({
          phase: "completed",
          stopReason: "budget_exhausted",
          detail: "QA time budget reached.",
          blockers: [],
        });
      }
      if (counters.actionsExecuted >= budget.maxDeviceActions) {
        return outcome({
          phase: "completed",
          stopReason: "budget_exhausted",
          detail: "Device action budget used up.",
          blockers: [],
        });
      }

      let action: ProposedAction;
      let target: UiElement | undefined;
      let goalId = "explore";
      let decisionSummary: string;
      let source: "planner" | "deterministic" = "deterministic";

      if (!snap.appForeground) {
        relaunches += 1;
        if (relaunches > MAX_RELAUNCHES) {
          return outcome({
            phase: "completed",
            stopReason: "access_blocked",
            detail: "The app could not be kept in the foreground.",
            blockers: [
              "The app left the foreground repeatedly and relaunching did not keep it open.",
            ],
          });
        }
        action = { type: "relaunch", clearData: false };
        decisionSummary = "The app is no longer in the foreground; relaunch it.";
      } else {
        let warning: string | undefined;
        if (graph.stuckFor(4)) {
          stuckWarnings += 1;
          if (stuckWarnings > 3) {
            return outcome({
              phase: "completed",
              stopReason: "goals_exhausted",
              detail: "No further progress: recent actions kept returning to the same screen.",
              blockers: [],
            });
          }
          warning =
            "The last 4 actions did not change the screen. Choose a different control, scroll, or go back.";
        }

        let visionNote: string | undefined;
        if (
          isNew &&
          snap.screen.elements.length < 3 &&
          !snap.screen.secretsVisible &&
          counters.visionCalls < budget.maxVisionRequests
        ) {
          counters.visionCalls += 1;
          try {
            visionNote = (await ports.vision(shot, VISION_PROMPT)).content.slice(0, 400);
          } catch (error) {
            ports.log(`vision call failed: ${(error as Error).message}`);
          }
        }

        const ctx: PlanningContext = {
          platform,
          modes: config.modes,
          observationId,
          step,
          screen: snap.screen,
          appForeground: snap.appForeground,
          state,
          graph,
          goals,
          visionNote,
          warning,
        };
        const verdict = await decide(ctx);
        if (verdict) {
          action = verdict.output.nextAction;
          target = verdict.target;
          goalId = verdict.output.goalId;
          decisionSummary = verdict.output.decisionSummary;
          source = "planner";
          for (const g of verdict.output.proposedGoals) {
            if (!goals.some((x) => x.goalId === g.goalId)) goals.push(g);
          }
          if (goals.length > 6) goals.splice(0, goals.length - 6);
        } else {
          ({ action, target } = fallback(snap.screen, fp));
          decisionSummary = "No valid planner proposal; trying an untried control or going back.";
        }

        // Same action from the same state again and again: replace it instead of looping.
        if (graph.isLooping(fp, keyOf(action, target))) {
          const alt = fallback(snap.screen, fp);
          ports.emit({
            type: "note",
            payload: { level: "info", message: "Loop detected; choosing a different action." },
          });
          action = alt.action;
          target = alt.target;
          source = "deterministic";
          decisionSummary = "Loop detected; switching to an untried control or going back.";
        }
      }

      step += 1;
      const commandId = `cmd-${step}`;
      const summary = describeAction(
        action,
        target?.label ?? target?.text ?? target?.stableId,
      ).slice(0, 200);
      ports.emit({
        type: "action_planned",
        stepIndex: step,
        payload: {
          commandId,
          goalId,
          summary,
          decisionSummary: decisionSummary.slice(0, 280),
          source,
        },
      });
      await ports.flush();
      ports.checkpoint();

      const t0 = ports.now();
      let error: string | undefined;
      try {
        await execute(action, target, snap);
      } catch (e) {
        if (isSessionDead(e)) throw e;
        error = (e as Error).message.split("\n")[0]?.slice(0, 200) ?? "action failed";
      }
      counters.actionsExecuted += 1;
      pending = {
        commandId,
        fromFp: fp,
        key: keyOf(action, target),
        summary,
        outcome: error ? "failed" : "ok",
        durationMs: Math.max(0, ports.now() - t0),
        error,
      };
      await ports.sleep(config.settleMs ?? 800);
    }
  } catch (error) {
    if (error instanceof AgentStop) return outcome(error.outcome);
    throw error;
  }
}
