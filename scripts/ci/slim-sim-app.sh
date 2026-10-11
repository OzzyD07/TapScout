#!/usr/bin/env bash
# Shrinks a Simulator .app for upload (benchmark builds, docs/07 A5): strips debug symbols from
# every Mach-O file, optionally drops app extensions (widgets, share and notification
# extensions are not part of the app's own UI), then re-signs ad hoc so the Simulator still
# launches it. Usage: slim-sim-app.sh <path/to/App.app> [--drop-plugins]
set -euo pipefail
app="$1"
before=$(du -sk "$app" | cut -f1)
if [ "${2:-}" = "--drop-plugins" ]; then rm -rf "$app/PlugIns" "$app/Extensions"; fi
while IFS= read -r -d '' f; do
  if file -b "$f" | grep -q 'Mach-O'; then xcrun strip -S -x "$f" 2> /dev/null || true; fi
done < <(find "$app" -type f -print0)
codesign --force --deep --sign - --timestamp=none "$app"
echo "slimmed $(basename "$app"): ${before} KB → $(du -sk "$app" | cut -f1) KB"
