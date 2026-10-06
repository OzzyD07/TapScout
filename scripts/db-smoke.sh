#!/usr/bin/env bash
# Runs the RPC/RLS smoke test against the local Supabase database (rolls back).
set -euo pipefail
cd "$(dirname "$0")/.."
container="supabase_db_$(grep -m1 '^project_id' supabase/config.toml | cut -d'"' -f2)"
docker exec -i "$container" psql -U postgres -d postgres -v ON_ERROR_STOP=1 -q < supabase/tests/rpc_smoke.sql
