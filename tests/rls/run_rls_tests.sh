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

# Revue CTO §B : concurrence RÉELLE sur un même token, avec deux connexions.
# La première transaction verrouille la ligne (FOR UPDATE) et dort ; la seconde
# démarre pendant ce temps et ne doit pouvoir consommer le token qu'après le
# COMMIT de la première — donc voir `already_used`.
concurrency_test() {
  local log1 out1 out2
  log1="$(mktemp)"
  {
    printf "%s\n" \
      "SET ROLE service_role;" \
      "BEGIN;" \
      "SELECT 'S1=' || (consume_invitation('tok-race-1', '00000000-0000-0000-0000-00000000000a', 'usera@example.test')->>'status');" \
      "SELECT pg_sleep(3);" \
      "COMMIT;" \
    | docker exec -i "$CONTAINER" psql -t -A -q -U postgres -d postgres > "$log1" 2>&1
  } &
  local pid1=$!
  sleep 1
  out2=$(printf "%s\n" \
      "SET ROLE service_role;" \
      "SELECT 'S2=' || (consume_invitation('tok-race-1', '00000000-0000-0000-0000-00000000000a', 'usera@example.test')->>'status');" \
    | docker exec -i "$CONTAINER" psql -t -A -q -U postgres -d postgres 2>&1)
  wait $pid1
  out1="$(cat "$log1")"; rm -f "$log1"
  echo "concurrence : ${out1//$'\n'/ } | ${out2//$'\n'/ }"
  if ! grep -q 'S1=ok' <<<"$out1" || ! grep -q 'S2=already_used' <<<"$out2"; then
    echo "FAIL P0-6.10 deux consommations concurrentes du même token" >&2
    return 4
  fi
  echo "NOTICE:  PASS P0-6.10 deux requêtes concurrentes → une seule réussite"
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

concurrency_test
rc=$?
if [ $rc -ne 0 ]; then
  echo "RLS TESTS: FAILED (exit=$rc)"
  exit $rc
fi
echo "RLS TESTS: PASSED"
