# Devpost submission — TapScout

Draft of every Devpost field. Items in `<angle brackets>` are filled in on submission day.

---

## Project name

TapScout

## Elevator pitch (≤ 200 characters)

Hand it an Android or iOS build: an NVIDIA Nemotron agent tests it on an emulator and a simulator with no scripts. Every bug comes back with screenshots, steps and a reproduction rate.

(184 characters.)

## Thumbnail and image gallery

Files are in `Desktop/video/devpost/` (copies of `docs/media/`). Devpost recommends 3:2; the
thumbnail is 1500×1000.

| File | Caption |
|---|---|
| `00-thumbnail.png` | Thumbnail (not a gallery image) |
| `01-live-run.png` | Live run: the agent relaunched the app and is replaying the steps to confirm saved text is lost. |
| `02-finding.png` | A finding: expected vs. observed, the exact steps, and a screenshot for each replay. Reproduced 2/2. |
| `03-report.png` | The report: per-platform totals, a summary whose every claim links to a finding, and the screen map. |
| `04-triage.png` | Nemotron 3 Ultra reviews each finding and explains its verdict. |
| `05-architecture.png` | Browser → Next.js on Vercel → Nemotron on Nebius Token Factory; devices on GitHub Actions runners. |
| `06-benchmark.png` | Main screens reached in one session on six open-source apps across five UI frameworks. |

## Track

Coding and Agentic Engineering

## Links

- Demo: https://tap-scout-zeta.vercel.app
- Code: https://github.com/OzzyD07/TapScout (Apache-2.0)
- Video: https://youtu.be/8fvmCpTaPKA (2:50)

---

## About the project

### Inspiration

Mobile apps ship with bugs that a person would find in five minutes of tapping around: a form
that loses what you typed after a restart, a button hidden behind the keyboard, a crash on a long
title. Catching them automatically still means writing and maintaining UI test scripts for every
screen, on two platforms. Small teams skip it. We wanted a tester you can hand a build to, the way
you would hand it to a colleague: "here's the app, try it, tell me what's broken — and show me."

### What it does

TapScout takes an Android APK and/or an iOS Simulator build and tests it with no scripts.

1. **Upload** a build, or pick the built-in sample app. Optionally add a test account for apps
   behind a sign-in, and a note on what to focus on.
2. **Choose modes**: functional flows, bug/stress, UI/UX, accessibility, store readiness.
3. **Watch it live.** Each platform runs on its own fresh device: an Android emulator and an iOS
   Simulator, in parallel. The timeline shows every action the agent takes, why it took it, and
   the screenshot after.
4. **Get a report.** Every finding has expected vs. observed behaviour, evidence, replay steps and
   a reproduction rate (`Reproduced 2/2`). A coverage table lists the screens reached and what was
   not. Checks that could not run are marked `Unsupported` or `Not tested` — never guessed.

What it found in our measurements:
- **Planted bugs.** On the sample app, 5–6 of 6 known bugs, on both platforms, including data lost
  after a relaunch, a keyboard covering the submit button and a crash on a long title. The shared
  showcase run found all six on Android and iOS with no false alarms. The fixed build produces
  zero findings.
- **Real apps.** On six open-source apps across five UI stacks (Android Views, Jetpack Compose,
  Flutter, React Native, SwiftUI), it reaches most main screens in one 17-minute session.
- **Real bugs.** It found a real crash in Jerboa (Lemmy client), with 1 false positive in 21
  findings.

### How we built it

**NVIDIA Nemotron on Nebius Token Factory runs the agent.** All model calls go through a
server-side relay to Token Factory's OpenAI-compatible API:

- **Planner** — `nvidia/Nemotron-3_5-Lightning` picks the next action every step from a normalised
  list of on-screen elements. It answers in strict JSON schema with reasoning off, in about one
  second, and up to 90 times per platform.
- **Test plan** — `nvidia/Nemotron-3-Ultra-550b-a55b` reads the first screens and writes
  app-specific goals ("create a habit and edit it").
- **Triage** — the same Ultra model reviews heuristic findings at the end and lowers likely false
  positives.
- **Summary** — Lightning writes the report summary. A validator rejects any claim not backed by
  the report.
- **Vision** — `openbmb/MiniCPM-V-4_5` confirms clipped text and finds controls on screens that
  expose no accessibility data.

A platform session costs about $0.016 in model calls.

**The loop: observe → plan → validate → act → check.**
- **Observe.** The runner reads the accessibility tree and a screenshot through Appium, and turns
  both platforms into one element list. Secrets are masked first.
- **Validate.** Every proposed action is checked against the schema and the current screen before
  it reaches the device. Screen text is treated as data, never as instructions.
- **Deterministic rules** handle what a model should not decide: system permission dialogs,
  onboarding, never tapping controls that post, follow, report, vote or cost money, and leaving
  screens where nothing changes.
- **Replay.** Candidate issues are replayed before they become findings.

**Infrastructure.**
- **Web:** Next.js on Vercel.
- **Data:** Supabase for auth, Postgres with row-level security, Realtime for the live timeline,
  and Storage for builds and evidence.
- **Devices:** free GitHub-hosted runners — Linux with KVM for the Android emulator, macOS for the
  iOS Simulator.
- **Isolation:** each run gets a short-lived runner token and a fresh device. Model and storage
  keys never reach the runner or the browser.

**Measurement.**
- **Hidden ground truth.** Quality is measured against ground truth the agent never sees: a
  sample app with seeded, fixed and login variants, plus a benchmark of eight open-source apps
  (including one that needs a sign-in and a game with no accessibility tree).
- **Regression checks.** Every change to the agent was checked against those numbers before it
  stayed.

### Challenges we ran into

- **Real apps are full of interruptions.** These included permission dialogs, onboarding
  carousels, a launcher that froze after a cold boot, cookie banners and share sheets. On iOS 26
  several of these are system alerts that don't appear in the app's accessibility tree at all.
  The agent kept tapping an invisible notification prompt until we read it through
  WebDriverAgent.
- **False positives.** Our first accessibility pass flagged 73% false positives on one app. We
  reduced this by grounding every check in the element tree, grouping duplicates and having
  Nemotron triage the rest.
- **iOS was slow.** Reading the screen took up to 7.7 s per step. Measuring each option showed
  90% of the cost was one attribute (`visible`). We now read without it and infer what a presented
  sheet covers from the tree's structure. That brings it to about 0.6 s on most screens.
  Together with handling the invisible system alerts, the best iOS score on our benchmark app went
  from 2/7 to 6/7.
- **Running on free tiers.** Supabase's 50 MB file limit blocked real iOS builds, so builds are
  stored in 45 MB parts and joined on the runner (up to 200 MB). Evidence is compressed and kept
  for 7 days.

### Accomplishments that we're proud of

- **No scripts.** One agent tests Android and iOS apps across five UI stacks without a single
  test script.
- **Proof for every finding.** Each finding comes with evidence and a measured reproduction rate,
  and a report that says what it did not test.
- **Measured quality.** Results are measured against ground truth the agent never sees, not
  demos picked after the fact.
- **Cheap to run.** A full two-platform run costs a few cents in model calls on free
  infrastructure.

### What we learned

- **Deterministic rules alongside the model.** A small, fast model like Nemotron Lightning makes
  a very good planner when the problem is shaped for it: a compact element list, strict JSON
  schema output and validation before acting. The rules handle what a model should not decide.
- **Measurement over intuition.** Measuring beat guessing every time. Each big improvement
  (interruptions, false positives, iOS speed) started from a run log that contradicted our
  assumption.
- **Reports that say what they missed.** Honest reports are more useful than impressive ones:
  `Not tested` and `Reproduced 1/3` are what make the rest believable.

### What's next

- **Physical devices** and longer sessions for large apps.
- **Change-aware re-tests** that revisit only what a new build changed.
- **CI integration**, so every pull request gets a TapScout run.
- **More store-readiness rules** for both stores.

## Built with

nvidia-nemotron, nebius-token-factory, minicpm-v, typescript, next.js, react, tailwindcss,
vercel, supabase, postgresql, github-actions, appium, uiautomator2, xcuitest, android-emulator,
ios-simulator, expo, react-native, zod, vitest

---

## Testing instructions (for judges)

```text
Demo URL: https://tap-scout-zeta.vercel.app
Accounts (any one; separate accounts let judges run tests at the same time):
  judge1@tapscout.com / <password 1>
  judge2@tapscout.com / <password 2>
  judge3@tapscout.com / <password 3>

1. Sign in. Android and iOS are preselected with "FieldNotes — sample: seeded", our sample
   app with planted bugs ("fixed" has them repaired, "login" sits behind a sign-in).
2. Select any test modes (all five show the most) and press Start Test.
3. Open the run. Switch between the Android and iOS timelines to see each action, the
   agent's reason and the screenshot after it, live.
4. When the run finishes, open the report: findings with evidence, replay steps and
   reproduction rates, the screens reached, and what was not tested.
5. To see a finished report right away, open one of the runs labelled
   "Previously completed sample run".

You can also upload your own build: an .apk, or a .zip of an iOS Simulator .app (up to 200 MB).

No provider account, API key or payment is required.
Typical runtime: 15–25 minutes per run, including device start-up. macOS runners
can queue for a few minutes at busy times. Each account can run two tests at once.
```

## Feedback on the tools

**Nebius Token Factory.**
- **What worked well:**
  - The OpenAI-compatible API made the relay simple.
  - `response_format` with a JSON schema was reliable for the planner.
  - Latency on Nemotron Lightning (about one second) made a step-by-step agent practical.
- **What we wish were different:**
  - Reasoning has to be turned off per request (`chat_template_kwargs: {enable_thinking:
    false}`). With it on, the planner used 700–800 tokens and hit the output limit. A note in
    the model card would save others that discovery.
  - The vision variant of Nemotron is dedicated-endpoint only (GPU-hour billing), so we used a
    public vision model instead. A public NVIDIA vision endpoint would have let us stay
    all-NVIDIA.

  - The public vision model (`MiniCPM-V-4_5`) also returns `<think>` blocks unless asked not
    to; our relay strips them. One documented switch for reasoning across all models would help.
  - In our probes, `Nemotron-3-Nano-30B` was not reliable with strict JSON schema output for
    the planner, while Lightning was. A short "which model for structured output" note in the
    catalogue would have saved a round of testing.

**NVIDIA Nemotron.**
- **Lightning** follows a strict schema well and is cheap enough to call 90 times per session.
- **Ultra** writes noticeably better test plans and triage judgements; we use it once or twice
  per session where quality matters more than latency.

**Nebius AI Cloud.** Not used: the device sessions need KVM (Android emulator) and macOS (iOS
Simulator), so they run on GitHub-hosted runners; only inference runs on Nebius.

## Project history

TapScout was started on 6 October 2026, inside the submission period; nothing existed before.
