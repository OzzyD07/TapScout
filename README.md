# TapScout

**Autonomous mobile QA agent for Android and iOS.** Upload an Android APK and/or an iOS Simulator build, pick test modes, and watch an AI agent explore
and test the app on real emulators/simulators — no test scripts required. Every finding comes with
evidence, reproduction steps and an honest reproduction rate (`Reproduced n/m`).

Built for the [Nebius x NVIDIA Global AI Hackathon](https://nebiusglobalaihackathon.devpost.com/).
The planner is **NVIDIA Nemotron**, called at runtime through **Nebius Token Factory**.

> Status: early development (V1 phase F0). The demo URL, setup steps and supported runtimes will be
> completed before submission. Design documents (Turkish working docs) are in [`docs/`](docs/).

## How it works

```
Browser ──► Next.js on Vercel (UI, short API, model relay) ──► Nebius Token Factory (Nemotron + VLM)
   ▲                 │  workflow_dispatch
   │ Realtime        ▼
Supabase ◄──── WarpBuild runners: Android emulator / iOS Simulator + Appium + agent loop
(Auth, Postgres, Realtime,
 Storage: builds, screenshots, logs, reports)
```

- One `TestRun` has one `PlatformSession` per platform. Selected modes share the session's
  exploration and evidence; they never multiply device jobs.
- The agent loop (Observe → Plan → Act → Evaluate) runs inside the runner. Each model call goes
  through a server-side relay, so provider keys never reach the runner or the browser.
- Model output is validated against a strict schema and the current UI before any device action.
  Screen text is treated as data under test, never as instructions.

### Test modes

| Mode | V1 checks |
|---|---|
| Functional / User Flows | Discovered flows, form feedback, persistence after relaunch |
| Bug / Stress | Empty/long/emoji input, background/foreground, keyboard, bounded rapid taps |
| UI / UX | Occluded actions, clipping, overlap, safe-area candidates |
| Accessibility | Labels, touch target candidates, large text, platform audit where supported |
| Store Readiness | Dated rule pack: in-app account deletion, privacy policy reachability |

Unsupported checks are reported as `Unsupported`, unfinished ones as `Not tested`, and no coverage
percentage is invented for an app of unknown size. iOS evidence is always labelled *iOS Simulator*.

## Repository layout

```
apps/sample-app/     Expo sample app (FieldNotes) used for demos and agent quality evaluation
packages/shared/     Versioned Zod contracts: events, observations, actions, findings, reports, API
supabase/            Migrations (schema, RLS, atomic RPCs), smoke tests, local config
scripts/             Model probe, database smoke test
quality/             Ground truth for post-run evaluation — never visible to the agent
docs/                Product scope, architecture, agent design, delivery plan (Turkish)
```

## Local development

Requirements: Node.js 22, pnpm 10, Docker (for local Supabase).

```bash
pnpm install
pnpm check                      # lint + typecheck + tests
npx supabase db start           # local Postgres with migrations applied
bash scripts/db-smoke.sh        # RPC + RLS smoke test (rolls back)
```

Probe the Token Factory models with your own key (copy `.env.example` to `.env` first):

```bash
pnpm probe:models
```

## Supported builds

| Platform | Input | Notes |
|---|---|---|
| Android | `.apk` | Must include an ABI the x86_64 emulator can run |
| iOS | `.zip` containing an ARM64 **iOS Simulator** `.app` | Physical-device `.ipa` builds are not accepted |

## License

[Apache-2.0](LICENSE). The sample app template assets are © 650 Industries (Expo), MIT — see
`apps/sample-app/LICENSE`.
