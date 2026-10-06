#!/usr/bin/env bash
# Fails if runtime code imports or reads anything under quality/ (the post-run ground truth).
# Mentions in comments are allowed; imports, requires and file reads are not (docs/03 §10).
set -euo pipefail
cd "$(dirname "$0")/.."

q="[\"'\`]"
pattern="(from|import\(|require\(|readFile[A-Za-z]*\(|readdir[A-Za-z]*\()[[:space:]]*${q}[^\"'\`]*quality/"

if grep -rIlE --exclude-dir=node_modules --exclude-dir=dist \
  --include='*.ts' --include='*.tsx' --include='*.mjs' --include='*.js' \
  "$pattern" apps packages scripts; then
  echo "Runtime code must not import or read quality/ (ground truth)." >&2
  exit 1
fi
echo "ground truth isolation: ok"
