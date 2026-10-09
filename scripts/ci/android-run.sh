#!/usr/bin/env bash
# Runs inside ReactiveCircus/android-emulator-runner once the emulator has booted.
# Expects RUN_ID, TAPSCOUT_API_URL and OUT. The runner downloads the build itself.
set -euo pipefail

: "${RUN_ID:?RUN_ID is required}"
out="${OUT:-.artifacts/run}"
mkdir -p "$out/android"

adb devices -l > "$out/android/adb-devices.txt"
OUT="$out" bash scripts/ci/start-appium.sh

status=0
node packages/runner/dist/main.js --platform android --run-id "$RUN_ID" --out "$out" || status=$?

adb logcat -d -t 2000 > "$out/android/logcat.txt" 2>/dev/null || true
kill "$(cat "$out/appium.pid")" 2>/dev/null || true
exit "$status"
