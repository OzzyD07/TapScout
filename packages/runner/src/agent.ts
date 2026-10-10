// Agent loop (docs/03 §2): Observe → state graph → Plan (Nemotron via relay) → Validate → Act →
// Evaluate, one device action at a time, inside the platform budget. Cancellation and lease loss
// arrive through `checkpoint()`, which throws; normal endings return an outcome.

import {
  type ChatMessage,
  type CheckResult,
  describeAction,
  type Finding,
  formatReproduction,
  type PlatformBudget,
  type ProposedAction,
  type ProposedGoal,
  type RelayResponse,
  type RunEventInput,
  type SessionCounters,
  type StopReason,
  type TestMode,
  type UiElement,
  type VersionStamp,
} from "@tapscout/shared";
import { RunnerApiError } from "./api.js";
import {
  buildFunctionalChecks,
  FunctionalTracker,
  isBackControl,
  type PersistenceCandidate,
  type PersistenceProbe,
  valueVisible,
} from "./functional.js";
import { type NormalizedScreen, normalizeHierarchy, type Platform, pngSize } from "./observer.js";
import {
  buildPlannerMessages,
  generatedText,
  type PlanningContext,
  repairMessages,
  validatePlannerAnswer,
} from "./planner.js";
import { actionKey, fingerprint, matchElement, StateGraph } from "./state.js";

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
  /** Identity and versions stamped on findings. */
  run: { runId: string; sessionId: string };
  versions: VersionStamp;
  newId(): string;
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
  checks: CheckResult[];
  findings: Finding[];
}

type Ending = Pick<AgentOutcome, "phase" | "stopReason" | "detail" | "blockers">;

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
  fromLabel: string;
  fromElements: UiElement[];
  actionType: ProposedAction["type"];
  target?: UiElement;
  /** A system dialog appeared before the result was observed: the outcome is unknown. */
  interrupted?: boolean;
  key: string;
  summary: string;
  outcome: "ok" | "failed";
  durationMs: number;
  error?: string;
}

class AgentStop extends Error {
  constructor(readonly outcome: Ending) {
    super(outcome.detail);
  }
}

const OFF_APP = "off-app";
const MAX_CONSECUTIVE_INTERRUPTIONS = 4;
const MAX_PLANNER_FAILURES = 3;
const MAX_RELAUNCHES = 3;
/** Exploration is over when this many actions found no new state and this screen is fully tried. */
const NO_PROGRESS_STEPS = 10;
const CONTROL_ROLES = new Set(["button", "link", "tab", "cell"]);
/** Device actions a persistence check needs at least (relaunch, navigation, one replay). */
const PROBE_MIN_ACTIONS = 8;
/** Persistence checks per session (one per saved field). */
const MAX_PERSISTENCE_PROBES = 3;
/** System dialogs within this many recent actions mean the device is not usable. */
const INTERRUPTION_WINDOW = 8;
const MAX_INTERRUPTIONS_IN_WINDOW = 5;
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

  const tracker = new FunctionalTracker();
  let failedActions = 0;

  /** Check results (selected modes only) and the session outcome. */
  function finalize(
    end: Ending,
    probes: PersistenceProbe[] | { skipped: string },
    findings: Finding[] = [],
  ): AgentOutcome {
    const checks = config.modes.includes("functional")
      ? buildFunctionalChecks({
          platform,
          screenLabels: [
            ...new Set(
              graph
                .visited()
                .filter((st) => st.fingerprint !== OFF_APP)
                .map((st) => st.label),
            ),
          ],
          transitions: graph.transitions,
          failedActions,
          tracker,
          probes,
        })
      : [];
    counters.checksRun = checks.filter((c) => c.status !== "not_tested").length;
    for (const c of checks) {
      ports.emit({
        type: "check_result",
        payload: {
          checkId: c.checkId,
          mode: c.mode,
          status: c.status,
          summary: c.summary.slice(0, 300),
        },
      });
    }
    return { ...end, screens: graph.size, checks, findings };
  }

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
    return finalize(
      {
        phase: "blocked",
        stopReason: "access_blocked",
        detail: "The app did not show a usable screen within the launch timeout.",
        blockers: [
          last?.screen.interruption
            ? `A system dialog kept covering the app: ${last.screen.interruption.title}`
            : "No app screen with interactive elements appeared after launch.",
        ],
      },
      { skipped: "The app never showed a usable screen." },
    );
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

  function controlsOf(screen: NormalizedScreen): UiElement[] {
    return screen.elements.filter((e) => e.enabled && e.visible && CONTROL_ROLES.has(e.role));
  }

  function untriedControls(screen: NormalizedScreen, fp: string): UiElement[] {
    const tried = graph.get(fp)?.tried;
    return controlsOf(screen).filter((e) => !tried?.has(actionKey("tap", e)));
  }

  /** Untried controls the open keyboard covers: still part of this screen, just not reachable yet. */
  function coveredControls(screen: NormalizedScreen, fp: string): UiElement[] {
    const tried = graph.get(fp)?.tried;
    return screen.elements.filter(
      (e) =>
        !e.visible && e.enabled && CONTROL_ROLES.has(e.role) && !tried?.has(actionKey("tap", e)),
    );
  }

  function keyboardCloseFailed(fp: string): boolean {
    return graph.get(fp)?.tried.get(actionKey("hide_keyboard"))?.results.at(-1) === "same screen";
  }

  /**
   * Deterministic fallback: an untried control, else back (unless back already left us on this
   * screen), else the least-tried control.
   */
  function fallback(
    screen: NormalizedScreen,
    fp: string,
  ): { action: ProposedAction; target?: UiElement } {
    // An open keyboard hides controls; closing it is the cheapest way to make progress.
    const tried = graph.get(fp)?.tried;
    const hid = tried?.get(actionKey("hide_keyboard"));
    if (screen.keyboardVisible && hid?.results.at(-1) !== "same screen") {
      return { action: { type: "hide_keyboard" } };
    }
    const untried = untriedControls(screen, fp)[0];
    if (untried) return { action: { type: "tap", targetRef: untried.ref }, target: untried };
    const back = tried?.get(actionKey("back"));
    if (back?.results.at(-1) !== "same screen") return { action: { type: "back" } };
    const least = controlsOf(screen).sort(
      (a, b) =>
        (tried?.get(actionKey("tap", a))?.count ?? 0) -
        (tried?.get(actionKey("tap", b))?.count ?? 0),
    )[0];
    if (least) return { action: { type: "tap", targetRef: least.ref }, target: least };
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
        try {
          await device.hideKeyboard();
        } catch (error) {
          // The return key ends editing in most single-line fields (React Native: blurOnSubmit).
          try {
            await device.pressEnter();
            return;
          } catch {
            // Fall through to a tap outside the field.
          }
          // Otherwise a tap on plain content text (not the navigation bar) usually closes it.
          const neutral = snap.screen.elements.find(
            (e) =>
              e.role === "text" &&
              e.visible &&
              !e.clickable &&
              e.bounds.y > snap.screen.heightPx * 0.15,
          );
          if (!neutral) throw error;
          const p = center(neutral);
          await device.tapAt(p.x, p.y);
        }
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
  /** The latest recorded observation; the persistence probe continues from it. */
  let current: { snap: Snapshot; label: string; shot: string } | null = null;
  let pending: Pending | null = null;
  let fresh: Snapshot | null = first;
  let consecutiveInterruptions = 0;
  let relaunches = 0;
  let stuckWarnings = 0;
  let lastNewStateStep = 0;
  const interruptionSteps: number[] = [];
  const findings: Finding[] = [];
  const probes: PersistenceProbe[] = [];
  const probedFields = new Set<string>();
  let probeSkipped: string | null = null;

  async function explore(): Promise<Ending> {
    for (;;) {
      ports.checkpoint();
      const snap: Snapshot = fresh ?? (await observe());
      fresh = null;
      if (snap.screen.interruption) {
        consecutiveInterruptions += 1;
        if (pending) pending.interrupted = true;
        interruptionSteps.push(step);
        const recent = interruptionSteps.filter((s) => s > step - INTERRUPTION_WINDOW).length;
        if (
          consecutiveInterruptions > MAX_CONSECUTIVE_INTERRUPTIONS ||
          recent > MAX_INTERRUPTIONS_IN_WINDOW
        ) {
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
      current = { snap, label: state.label, shot };
      if (isNew) lastNewStateStep = step;
      counters.screensObserved = graph.visited().filter((s) => s.fingerprint !== OFF_APP).length;

      let created: PersistenceCandidate[] = [];
      if (pending?.interrupted) {
        ports.emit({
          type: "action_executed",
          stepIndex: step,
          payload: {
            commandId: pending.commandId,
            summary: pending.summary,
            outcome: "uncertain",
            durationMs: pending.durationMs,
            screenshotArtifactId: shot,
            resultSummary: "A system dialog interrupted this action; its result is unknown.",
          },
        });
        pending = null;
      }
      if (pending) {
        graph.record(
          pending.fromFp,
          pending.key,
          pending.summary,
          snap.appForeground ? fp : null,
          step,
          pending.outcome === "ok"
            ? { type: pending.actionType, target: pending.target }
            : undefined,
        );
        if (pending.outcome === "ok") {
          created = tracker.noteOutcome({
            type: pending.actionType,
            target: pending.target,
            fromLabel: pending.fromLabel,
            fromElements: pending.fromElements,
            toLabel: snap.appForeground ? state.label : null,
            toElements: snap.screen.elements,
            step,
            artifactId: shot,
          });
        }
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

      // Functional: re-check a value right after it was saved, while the app still holds it.
      const toProbe =
        probes.length < MAX_PERSISTENCE_PROBES
          ? created.find((c) => c.screenLabel === state.label && !probedFields.has(fieldId(c)))
          : undefined;
      if (config.modes.includes("functional") && toProbe) {
        const reason = probeBlockedReason();
        if (reason) probeSkipped ??= reason;
        else {
          probedFields.add(fieldId(toProbe));
          probes.push(await probeCandidate(toProbe));
          continue;
        }
      }

      // Budget gates before any new QA or model work (docs/03 §9).
      if (ports.now() >= config.softDeadline) {
        return {
          phase: "completed",
          stopReason: "budget_exhausted",
          detail: "QA time budget reached.",
          blockers: [],
        };
      }
      if (counters.actionsExecuted >= budget.maxDeviceActions) {
        return {
          phase: "completed",
          stopReason: "budget_exhausted",
          detail: "Device action budget used up.",
          blockers: [],
        };
      }

      let action: ProposedAction;
      let target: UiElement | undefined;
      let goalId = "explore";
      let decisionSummary: string;
      let source: "planner" | "deterministic" = "deterministic";

      if (!snap.appForeground) {
        relaunches += 1;
        if (relaunches > MAX_RELAUNCHES) {
          return {
            phase: "completed",
            stopReason: "access_blocked",
            detail: "The app could not be kept in the foreground.",
            blockers: [
              "The app left the foreground repeatedly and relaunching did not keep it open.",
            ],
          };
        }
        action = { type: "relaunch", clearData: false };
        decisionSummary = "The app is no longer in the foreground; relaunch it.";
      } else {
        if (
          step - lastNewStateStep >= NO_PROGRESS_STEPS &&
          untriedControls(snap.screen, fp).length === 0 &&
          (coveredControls(snap.screen, fp).length === 0 || keyboardCloseFailed(fp))
        ) {
          return {
            phase: "completed",
            stopReason: "goals_exhausted",
            detail: `No new screen in the last ${NO_PROGRESS_STEPS} actions and every control here was tried.`,
            blockers: [],
          };
        }
        let warning: string | undefined;
        if (graph.stuckFor(4)) {
          stuckWarnings += 1;
          if (stuckWarnings > 3) {
            return {
              phase: "completed",
              stopReason: "goals_exhausted",
              detail: "No further progress: recent actions kept returning to the same screen.",
              blockers: [],
            };
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

        // Leaving a form while the keyboard hides controls nobody tried (often the submit button)
        // would never test them: close the keyboard first.
        if (
          snap.screen.keyboardVisible &&
          (action.type === "back" || isBackControl(target)) &&
          coveredControls(snap.screen, fp).length > 0 &&
          !keyboardCloseFailed(fp)
        ) {
          action = { type: "hide_keyboard" };
          target = undefined;
          source = "deterministic";
          decisionSummary = "The keyboard covers controls that were not tried yet; close it first.";
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
        if (action.type === "type" && target) {
          tracker.noteTyped(generatedText(action.input), target, state.label, step);
        }
      } catch (e) {
        if (isSessionDead(e)) throw e;
        error = (e as Error).message.split("\n")[0]?.slice(0, 200) ?? "action failed";
      }
      counters.actionsExecuted += 1;
      pending = {
        commandId,
        fromFp: fp,
        fromLabel: state.label,
        fromElements: snap.screen.elements,
        actionType: action.type,
        target,
        key: keyOf(action, target),
        summary,
        outcome: error ? "failed" : "ok",
        durationMs: Math.max(0, ports.now() - t0),
        error,
      };
      if (error) failedActions += 1;
      await ports.sleep(config.settleMs ?? 800);
    }
  }

  // ---- Deterministic actions for checks and replays (no planner involved).
  class ProbeBlocked extends Error {}

  async function act(
    action: ProposedAction,
    target: UiElement | undefined,
    why: string,
    source: "deterministic" | "replay",
  ): Promise<boolean> {
    if (!current) throw new ProbeBlocked("no observation");
    if (counters.actionsExecuted >= budget.maxDeviceActions) {
      throw new ProbeBlocked("device action budget used up");
    }
    ports.checkpoint();
    step += 1;
    const commandId = `cmd-${step}`;
    const summary = describeAction(action, target?.label ?? target?.text ?? target?.stableId).slice(
      0,
      200,
    );
    ports.emit({
      type: "action_planned",
      stepIndex: step,
      payload: {
        commandId,
        goalId: "functional-persistence",
        summary,
        decisionSummary: why.slice(0, 280),
        source,
      },
    });
    const t0 = ports.now();
    let error: string | undefined;
    try {
      await execute(action, target, current.snap);
    } catch (e) {
      if (isSessionDead(e)) throw e;
      error = (e as Error).message.split("\n")[0]?.slice(0, 200) ?? "action failed";
    }
    counters.actionsExecuted += 1;
    const durationMs = Math.max(0, ports.now() - t0);
    await ports.sleep(action.type === "relaunch" ? 3_000 : (config.settleMs ?? 800));
    let snap = await observe();
    for (let i = 0; i < 4 && (snap.screen.interruption || snap.screen.elements.length === 0); i++) {
      if (snap.screen.interruption) await dismissInterruption(snap);
      else await ports.sleep(2_000);
      snap = await observe();
    }
    const shot = await ports.saveEvidence(`step-${step}`, "screenshot", snap.png, step);
    await ports.saveEvidence(`step-${step}`, "hierarchy", snap.xml, step);
    const fp = snap.appForeground ? fingerprint(snap.screen) : OFF_APP;
    const label =
      graph.get(fp)?.label ?? (snap.appForeground ? (snap.screen.title ?? "") : "Outside the app");
    current = { snap, label, shot };
    ports.emit({
      type: "action_executed",
      stepIndex: step,
      payload: {
        commandId,
        summary,
        outcome: error ? "failed" : "ok",
        durationMs,
        screenshotArtifactId: shot,
        resultSummary: (error ? `Failed: ${error}` : `Now on ${JSON.stringify(label)}.`).slice(
          0,
          300,
        ),
      },
    });
    await ports.flush();
    return !error;
  }

  function relaunchApp(why: string) {
    return act({ type: "relaunch", clearData: false }, undefined, why, "deterministic");
  }

  /** Follows observed navigation edges (taps and backs only) to a named screen. */
  async function navigateTo(toLabel: string): Promise<boolean> {
    for (let hops = 0; hops < 5; hops++) {
      if (!current) return false;
      if (current.label === toLabel) return true;
      const edge = graph.pathBetween(current.label, toLabel)?.[0];
      if (!edge) return false;
      const before = current.label;
      if (edge.type === "back") {
        await act({ type: "back" }, undefined, `Go back towards "${toLabel}".`, "replay");
        if (current?.label === before) return false;
        continue;
      }
      const target = edge.target
        ? matchElement(current.snap.screen.elements, edge.target)
        : undefined;
      if (!target) return false;
      await act(
        { type: "tap", targetRef: target.ref },
        target,
        `Open "${toLabel}" along an observed path.`,
        "replay",
      );
      // A step that leaves us where we were (a form rejecting the submit) will not get better.
      if ((current as { label: string } | null)?.label === before) return false;
    }
    return current?.label === toLabel;
  }

  function freshValue(value: string, n: number): string {
    return value.includes("@") ? `persist${n}@example.com` : `Check ${n} ${value}`.slice(0, 80);
  }

  /** Re-enters a new value, saves, relaunches and looks again: up to 2 valid replays (docs/03 §7). */
  async function reproduceLoss(probe: PersistenceProbe): Promise<Finding> {
    const c = probe.candidate;
    const reproduction = {
      target: 2,
      started: 0,
      valid: 0,
      symptom: 0,
      blocked: [] as Finding["reproduction"]["blocked"],
    };
    const replayShots: string[] = [];
    while (reproduction.valid < 2 && reproduction.started < 3) {
      reproduction.started += 1;
      const value = freshValue(c.value, reproduction.started);
      try {
        if (!(await navigateTo(c.formLabel)) || !current) {
          reproduction.blocked.push({
            reason: "access_blocked",
            detail: `"${c.formLabel}" could not be reached again.`,
          });
          break;
        }
        const field = matchElement(current.snap.screen.elements, c.field);
        if (!field) {
          reproduction.blocked.push({
            reason: "reset_failed",
            detail: `${c.fieldLabel} not found.`,
          });
          break;
        }
        await act(
          { type: "type", targetRef: field.ref, input: { kind: "literal", value }, submit: false },
          field,
          `Replay: enter a new value in ${c.fieldLabel}.`,
          "replay",
        );
        let commit = matchElement(current.snap.screen.elements, c.commit);
        if (!commit && current.snap.screen.keyboardVisible) {
          await act({ type: "hide_keyboard" }, undefined, "Hide the keyboard.", "replay");
          commit = matchElement(current.snap.screen.elements, c.commit);
        }
        if (!commit) {
          reproduction.blocked.push({
            reason: "reset_failed",
            detail: `"${c.commitLabel}" not found.`,
          });
          break;
        }
        await act(
          { type: "tap", targetRef: commit.ref },
          commit,
          `Replay: save with "${c.commitLabel}".`,
          "replay",
        );
        if (current.label !== c.screenLabel || !valueVisible(value, current.snap.screen.elements)) {
          reproduction.blocked.push({
            reason: "reset_failed",
            detail: "The new value was not shown after saving, so the replay is not valid.",
          });
          continue;
        }
        await relaunchApp("Replay: relaunch the app.");
        if (!(await navigateTo(c.screenLabel)) || !current) {
          reproduction.blocked.push({
            reason: "access_blocked",
            detail: `"${c.screenLabel}" could not be reached after the relaunch.`,
          });
          continue;
        }
        reproduction.valid += 1;
        replayShots.push(current.shot);
        if (!valueVisible(value, current.snap.screen.elements)) reproduction.symptom += 1;
      } catch (error) {
        if (!(error instanceof ProbeBlocked)) throw error;
        reproduction.blocked.push({ reason: "budget", detail: error.message });
        break;
      }
    }

    const shortValue = c.value.length > 60 ? `${c.value.slice(0, 57)}…` : c.value;
    return {
      findingId: config.newId(),
      runId: config.run.runId,
      sessionId: config.run.sessionId,
      platform,
      mode: "functional",
      checkId: "functional.persistence",
      title: `Saved ${c.fieldLabel} is lost after the app restarts`.slice(0, 160),
      expected:
        `After saving "${shortValue}" in ${c.fieldLabel} on "${c.formLabel}" with "${c.commitLabel}", ` +
        `"${c.screenLabel}" keeps showing it after the app is relaunched.`,
      observed:
        `"${c.screenLabel}" showed the value right after saving, ` +
        "but no longer showed it after the app was relaunched.",
      expectationBasis: "observed_invariant",
      evidenceKind: "measured",
      verification: reproduction.symptom > 0 ? "reproduced" : "observed",
      reproduction,
      confidence:
        reproduction.valid > 0 && reproduction.symptom === reproduction.valid ? "high" : "medium",
      severity: "high",
      severityRationale:
        "User-entered data silently disappears after a restart although the app showed it as saved.",
      conditions: [
        platform === "ios" ? "iOS Simulator" : "Android Emulator",
        "relaunch without clearing app data",
      ],
      replay: {
        precondition: `"${c.screenLabel}" is reachable with the data entered earlier in this session.`,
        resets: ["app_process"],
        path: [
          { index: 0, description: `Open "${c.formLabel}"` },
          {
            index: 1,
            description: `Type a new value into ${c.fieldLabel}`,
            locator: c.field.stableId ?? c.field.label,
          },
          {
            index: 2,
            description: `Tap "${c.commitLabel}"`,
            locator: c.commit.stableId ?? c.commit.label,
          },
          { index: 3, description: "Relaunch the app (data kept)" },
          { index: 4, description: `Open "${c.screenLabel}"` },
        ],
        observe: `The new ${c.fieldLabel} value is still shown on "${c.screenLabel}".`,
      },
      evidence: [
        { artifactId: c.savedArtifactId, role: "before" },
        ...(probe.afterArtifactId
          ? [{ artifactId: probe.afterArtifactId, role: "after" as const }]
          : []),
        ...replayShots.map((artifactId) => ({ artifactId, role: "replay" as const })),
      ],
      versions: config.versions,
      createdAt: new Date(ports.now()).toISOString(),
    };
  }

  function fieldId(c: PersistenceCandidate): string {
    return `${c.formLabel}|${c.field.stableId ?? c.field.label ?? c.field.text ?? ""}`;
  }

  function probeBlockedReason(): string | null {
    if (ports.now() >= config.softDeadline) {
      return "The QA time budget ran out before the persistence check.";
    }
    if (counters.actionsExecuted + PROBE_MIN_ACTIONS > budget.maxDeviceActions) {
      return "Too few device actions were left for the persistence check.";
    }
    return null;
  }

  /** Functional persistence check for one saved value: relaunch, re-open, look again (docs/03 §6.1). */
  async function probeCandidate(c: PersistenceCandidate): Promise<PersistenceProbe> {
    ports.emit({
      type: "phase_changed",
      payload: {
        from: "exploring",
        to: "testing",
        reason: `Persistence check: relaunch and look for the saved ${c.fieldLabel}.`,
      },
    });
    let probe: PersistenceProbe = { candidate: c, status: "unreachable" };
    try {
      await relaunchApp(`Relaunch the app to check that the saved ${c.fieldLabel} is kept.`);
      if ((await navigateTo(c.screenLabel)) && current) {
        const kept = valueVisible(c.value, current.snap.screen.elements);
        probe = { candidate: c, status: kept ? "kept" : "lost", afterArtifactId: current.shot };
      }
    } catch (error) {
      if (!(error instanceof ProbeBlocked)) throw error;
    }
    if (probe.status === "lost") {
      const findingId = config.newId();
      ports.emit({
        type: "finding_candidate",
        payload: {
          findingId,
          mode: "functional",
          title: `Saved ${c.fieldLabel} is lost after the app restarts`.slice(0, 160),
          severity: "high",
        },
      });
      ports.emit({
        type: "phase_changed",
        payload: { from: "testing", to: "reproducing", reason: "Replay the save → relaunch path." },
      });
      const finding = { ...(await reproduceLoss(probe)), findingId };
      probe.findingId = findingId;
      findings.push(finding);
      ports.emit({
        type: "finding_updated",
        payload: {
          findingId,
          verification: finding.verification,
          reproductionLabel: formatReproduction(finding.reproduction).slice(0, 120),
        },
      });
    }
    ports.emit({
      type: "phase_changed",
      payload: {
        from: probe.status === "lost" ? "reproducing" : "testing",
        to: "exploring",
        reason: "Back to exploration.",
      },
    });
    await ports.flush();
    return probe;
  }

  let ending: Ending;
  try {
    ending = await explore();
  } catch (error) {
    if (!(error instanceof AgentStop)) throw error;
    ending = error.outcome;
  }

  return finalize(
    ending,
    probes.length > 0
      ? probes
      : {
          skipped:
            probeSkipped ??
            "No saved value was seen on another screen during exploration, so nothing could be re-checked after a relaunch.",
        },
    findings,
  );
}
