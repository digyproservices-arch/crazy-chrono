#!/usr/bin/env bash
# ==========================================================================
# CTO-005A — Exécution des tests d'attaque RLS sur un PostgreSQL local jetable.
#
# NE TOUCHE JAMAIS SUPABASE : tout se passe dans un conteneur Docker éphémère
# (aucune variable SUPABASE_* n'est lue, aucun accès réseau sortant).
#
#   ./tests/rls/run_rls_tests.sh            # baseline (attendu KO) puis migré (attendu OK)
#   ./tests/rls/run_rls_tests.sh migrated   # migré uniquement
#   ./tests/rls/run_rls_tests.sh baseline   # baseline uniquement
# ==========================================================================
set -uo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
CONTAINER="cc-rls-test"
IMAGE="postgres:15-alpine"
MODE="${1:-both}"

cleanup() { docker rm -f "$CONTAINER" >/dev/null 2>&1 || true; }
trap cleanup EXIT

start_db() {
  cleanup
  docker run -d --name "$CONTAINER" -e POSTGRES_PASSWORD=postgres "$IMAGE" >/dev/null
  for _ in $(seq 1 60); do
    docker exec "$CONTAINER" pg_isready -U postgres >/dev/null 2>&1 && return 0
    sleep 1
  done
  echo "postgres n'a pas démarré" >&2
  exit 2
}

psql_file() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < "$1"
}

run_suite() {
  local apply_migrations="$1"
  start_db
  psql_file "$ROOT/tests/rls/00_bootstrap_supabase.sql"
  psql_file "$ROOT/tests/rls/01_baseline_legacy.sql"

  if [ "$apply_migrations" = "yes" ]; then
    for f in "$ROOT"/supabase/migrations/*.sql; do
      echo "→ $(basename "$f")"
      psql_file "$f" || { echo "MIGRATION FAILED: $f" >&2; return 3; }
    done
  fi

  psql_file "$ROOT/tests/rls/02_fixtures.sql"

  if [ "$apply_migrations" = "yes" ]; then
    # état cible : la moindre attaque réussie doit faire échouer la suite
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -t -A -q -U postgres -d postgres \
      < "$ROOT/tests/rls/10_attacks.sql"
  else
    # baseline : on inventorie TOUTES les attaques qui réussissent
    { echo "SELECT set_config('cc.soft','1',false);";
      sed 's/^\\set ON_ERROR_STOP on/\\set ON_ERROR_STOP off/' "$ROOT/tests/rls/10_attacks.sql"; } \
      | docker exec -i "$CONTAINER" psql -t -A -q -U postgres -d postgres
  fi
}

rc_baseline=""
if [ "$MODE" = "both" ] || [ "$MODE" = "baseline" ]; then
  echo "=== BASELINE (état pré-CTO-005A : les attaques DOIVENT réussir) ==="
  run_suite no > /tmp/rls_baseline.log 2>&1
  rc_baseline=$?
  grep -E '^(WARNING|ERROR)' /tmp/rls_baseline.log
  echo "--- baseline : $(grep -c 'VULNERABLE' /tmp/rls_baseline.log) attaque(s) réussie(s), \
$(grep -c '^NOTICE:  PASS' /tmp/rls_baseline.log) bloquée(s) — log complet : /tmp/rls_baseline.log"
fi

if [ "$MODE" = "baseline" ]; then exit 0; fi

echo "=== APRÈS MIGRATIONS CTO-005A (toutes les attaques doivent être bloquées) ==="
run_suite yes
rc=$?
if [ $rc -ne 0 ]; then
  echo "RLS TESTS: FAILED (exit=$rc)"
  exit $rc
fi
echo "RLS TESTS: PASSED"
