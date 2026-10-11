# Real-app benchmark set (docs/07 A5)

One file per open-source app: where it comes from, its main screens with the hierarchy markers
that identify them, the expected access outcome (`open`, `optional_sign_in`, `sign_in_required`)
and the manual verdict of every finding a run reported (`true_positive`, `false_positive`,
`unsure`). Build sources (pinned F-Droid versions and hashes, upstream commits) are in
`scripts/benchmark/apps.json`; `build-benchmark.yml` builds them and
`scripts/publish-benchmark.mjs` uploads them as ordinary builds of `tester@tapscout.com`.

Like `ground-truth/`, nothing here may be read by runtime code (`scripts/check-ground-truth.sh`),
and the device jobs delete `quality/` before the agent starts.

```bash
node --env-file=.env scripts/dev-run.mjs --owner tester@tapscout.com --platforms android \
  --modes functional,stress,ui_ux,accessibility,store_readiness --app "AntennaPod"
node --env-file=.env quality/evaluate-run.mjs --run <run id>
```

The main-screen lists were fixed from each app's sources before any run; markers may be
tightened when a run shows one is ambiguous, never to improve a score. Downloaded hierarchies
are cached under `quality/results/hierarchies/` (gitignored).
