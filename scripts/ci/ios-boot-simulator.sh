#!/usr/bin/env bash
# Picks an available iPhone simulator on the newest installed iOS runtime, boots it and prints
# its UDID. Writes the chosen device and runtime to $OUT/ios/simulator.json.
set -euo pipefail

out="${OUT:-.artifacts/smoke}"
mkdir -p "$out/ios"

xcrun simctl list -j devices available > "$out/ios/simctl-devices.json"
udid=$(node scripts/ci/pick-simulator.mjs "$out/ios/simctl-devices.json" "$out/ios/simulator.json")

xcrun simctl boot "$udid" 2>/dev/null || true
xcrun simctl bootstatus "$udid" -b >/dev/null
echo "$udid"
