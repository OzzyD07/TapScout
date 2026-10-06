# Ground truth (post-run quality evaluation only)

This folder will hold the manifest of intentional defects in the `seeded` sample app variant.

**It must never reach the agent.** Planner prompts, VLM observations, mode checks, evaluators,
agent memory and replay targets are built without it (docs/03 §10, docs/04 §6). It is used only
after a run, to compare the produced findings against the known seeds and to score missed
scenarios and false confident findings.

Rules:

- No runtime package (`apps/*`, `packages/*`) may import or read files from `quality/`.
- The runner workflow does not check out this folder.
- Fixture/reset identities the agent legitimately needs live in the sample manifest, not here.
