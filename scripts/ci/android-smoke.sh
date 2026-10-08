#!/usr/bin/env bash
# Runs inside ReactiveCircus/android-emulator-runner once the emulator has booted.
# Expects APP (path to the APK) and OUT (artifact directory).
set -euo pipefail

: "${APP:?APP must point to the APK}"
out="${OUT:-.artifacts/smoke}"
mkdir -p "$out/android"

adb devices -l | tee "$out/android/adb-devices.txt"
adb shell getprop ro.build.version.release > "$out/android/os-version.txt"
adb shell getprop ro.product.cpu.abilist > "$out/android/abi.txt"

OUT="$out" bash scripts/ci/start-appium.sh

status=0
node packages/adapters/dist/smoke.js --platform android --app "$APP" --out "$out" || status=$?

adb logcat -d -t 2000 > "$out/android/logcat.txt" 2>/dev/null || true
kill "$(cat "$out/appium.pid")" 2>/dev/null || true
exit "$status"
