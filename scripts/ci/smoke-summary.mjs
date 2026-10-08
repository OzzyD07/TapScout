#!/usr/bin/env node
// Appends the device smoke result for one platform to the GitHub job summary.
import { appendFileSync, existsSync, readFileSync } from "node:fs";

const platform = process.argv[2];
const file = `${process.env.OUT ?? ".artifacts/smoke"}/${platform}/result.json`;
const summary = process.env.GITHUB_STEP_SUMMARY;

if (!existsSync(file)) {
  console.log(`no result.json for ${platform}`);
  if (summary)
    appendFileSync(
      summary,
      `### ${platform} smoke: no result (setup failed before the smoke ran)\n`,
    );
  process.exit(0);
}

const r = JSON.parse(readFileSync(file, "utf8"));
const rows = r.steps
  .map((s) => {
    const detail = (s.detail ?? "").split("\n")[0].slice(0, 120).replace(/\|/g, "\\|");
    return `| ${s.name} | ${s.ok ? "✅" : "❌"} | ${s.durationMs} | ${detail} |`;
  })
  .join("\n");
const device = [r.device?.deviceName, r.device?.platformVersion].filter(Boolean).join(" ");
const text = `### ${platform} smoke: ${r.success ? "PASS" : "FAIL"} (${r.totalMs} ms)\n\n${device ? `Device: ${device}\n\n` : ""}| Step | OK | ms | Detail |\n|---|---|---|---|\n${rows}\n\n`;
console.log(text);
if (summary) appendFileSync(summary, text);
