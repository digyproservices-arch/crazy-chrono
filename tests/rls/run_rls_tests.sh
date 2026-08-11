#!/usr/bin/env bash
# ==========================================================================
# CTO-005A — Exécution des tests d'attaque RLS sur un PostgreSQL local jetable.
#
# NE TOUCHE JAMAIS SUPABASE : tout se passe dans un conteneur Docker éphémère
# (aucune variable SUPABASE_* n'est lue, aucun accès réseau sortant).
#
#   ./tests/rls/run_rls_tests.sh              # baseline (KO attendu), migré, safe rollback
#   ./tests/rls/run_rls_tests.sh migrated     # migré uniquement
#   ./tests/rls/run_rls_tests.sh baseline     # baseline uniquement
#   ./tests/rls/run_rls_tests.sh saferollback # migré + safe rollback (les attaques
#                                             # doivent RESTER bloquées)
#   ./tests/rls/run_rls_tests.sh roles        # contraintes CHECK de rôle legacy :
#                                             # cpd/cpc refusés avant 1200, acceptés
#                                             # après, migration fail-closed sur une
#                                             # valeur hors whitelist
#   ./tests/rls/run_rls_tests.sh prodlike     # baseline reproduisant le schéma
#                                             # PRODUCTION réel (user_id TEXT,
#                                             # webhook_events préexistante, 13
#                                             # SECURITY DEFINER exposées) :
#                                             # migrations + attaques + contrôles
#                                             # de compatibilité
#   ./tests/rls/run_rls_tests.sh precheck     # precheck + rapport consolidé sur les
#                                             # variantes de schéma (joined_at /
#                                             # created_at / colonnes absentes)
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

# Allowlist des 11 helpers d'identité de 0100, par SIGNATURE EXACTE (mêmes
# valeurs que la migration 1300 — aucun motif de nom : `cc_evil()` doit compter
# comme une exposition).
ALLOWLIST_SQL="ARRAY[
  'public.cc_current_role()','public.cc_is_admin()','public.cc_is_manager()',
  'public.cc_current_email()','public.cc_my_circonscription()','public.cc_my_region()',
  'public.cc_my_student_ids()','public.cc_my_class_ids()','public.cc_managed_class_ids()',
  'public.cc_visible_class_ids()','public.cc_visible_school_ids()']"

# Nombre de fonctions SECURITY DEFINER du schéma public exécutables par un rôle
# client (PUBLIC, anon ou authenticated), hors allowlist exacte ; un helper
# allowlisté ouvert à PUBLIC/anon compte aussi.
secdef_exposed() {
  docker exec -i "$CONTAINER" psql -t -A -q -U postgres -d postgres -c "
    WITH f AS (
      SELECT format('%I.%I(%s)', n.nspname, p.proname,
                    pg_get_function_identity_arguments(p.oid)) = ANY($ALLOWLIST_SQL) AS allowed,
             has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_ok,
             has_function_privilege('authenticated', p.oid, 'EXECUTE') AS auth_ok,
             EXISTS (SELECT 1 FROM aclexplode(COALESCE(p.proacl, acldefault('f', p.proowner))) a
                      WHERE a.grantee = 0 AND a.privilege_type = 'EXECUTE') AS public_ok
        FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
       WHERE n.nspname = 'public' AND p.prosecdef
    )
    SELECT count(*) FROM f
     WHERE CASE WHEN allowed THEN anon_ok OR public_ok
                ELSE anon_ok OR auth_ok OR public_ok END" 2>/dev/null | tr -d ' '
}

# Revue CTO finale §A : les default privileges doivent réellement priver PUBLIC
# de l'EXECUTE sur les fonctions FUTURES du rôle de migration.
default_privileges_test() {
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -t -A -q -U postgres -d postgres \
    < "$ROOT/tests/rls/31_default_privileges.sql" \
    || { echo "DEFAULT PRIVILEGES CHECKS FAILED" >&2; return 13; }
}

# Revue CTO finale §B : l'assertion 1300 repose sur une allowlist de signatures
# EXACTES. Une fonction `cc_*` inconnue, ou une surcharge inattendue d'un helper
# allowlisté, doit faire ÉCHOUER 1300 en la nommant.
secdef_allowlist_test() {
  local m="$ROOT/supabase/migrations/20260810_1300_cto005_secdef_assertion.sql"
  local out

  # État migré nominal : les 11 helpers exacts → 1300 passe.
  psql_file "$m" || { echo "FAIL 1300 échoue sur l'état migré nominal" >&2; return 14; }
  echo "NOTICE:  PASS 1300-A les 11 helpers exacts attendus → assertion OK"

  for probe in "cc_fake()" "cc_current_role(text)"; do
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <<SQL
CREATE FUNCTION public.${probe%%(*}($( [ "$probe" = "cc_current_role(text)" ] && echo "TEXT" ))
RETURNS TEXT LANGUAGE sql SECURITY DEFINER AS 'SELECT ''x''::text';
GRANT EXECUTE ON FUNCTION public.$probe TO authenticated;
SQL
    out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres < "$m" 2>&1)
    if grep -q "$probe" <<<"$out" && grep -qi 'ERROR' <<<"$out"; then
      echo "NOTICE:  PASS 1300-B $probe SECURITY DEFINER + authenticated → assertion ÉCHOUE en la nommant"
    else
      echo "FAIL 1300 n'a pas refusé $probe : $out" >&2
      return 14
    fi
    docker exec -i "$CONTAINER" psql -q -U postgres -d postgres \
      -c "DROP FUNCTION public.$probe" >/dev/null
  done

  # Retour à l'état nominal : l'assertion repasse.
  psql_file "$m" || { echo "FAIL 1300 ne repasse pas après suppression des sondes" >&2; return 14; }
  echo "NOTICE:  PASS 1300-C retour à l'allowlist exacte → assertion OK"
}

# Le fichier doit passer TEL QUEL : aucune section coupée, aucun nom de colonne
# adapté. `BEGIN READ ONLY` fait échouer la moindre écriture.
precheck_readonly() {
  { echo "BEGIN READ ONLY;";
    cat "$ROOT/docs/CTO_005_PRODUCTION_PRECHECK.sql";
    echo "COMMIT;"; } \
    | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres > /dev/null \
    || { echo "PRECHECK SQL FAILED (syntaxe, colonne absente ou écriture détectée)" >&2; return 5; }
  echo "→ docs/CTO_005_PRODUCTION_PRECHECK.sql : exécutable intégralement, READ ONLY"
}

# Le rapport consolidé est une requête unique : il doit rendre exactement un
# result set et ne jamais écrire.
report_readonly() {
  local rows
  rows=$({ echo "BEGIN READ ONLY;";
           cat "$ROOT/docs/CTO_005_PRODUCTION_REPORT.sql";
           echo "COMMIT;"; } \
    | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -t -A -q -U postgres -d postgres 2>&1) \
    || { echo "REPORT SQL FAILED: $rows" >&2; return 9; }
  local n
  n=$(grep -c '|' <<<"$rows")
  if [ "$n" -lt 50 ]; then
    echo "REPORT SQL a rendu $n ligne(s) : jeu de résultats inattendu" >&2
    return 9
  fi
  echo "→ docs/CTO_005_PRODUCTION_REPORT.sql : $n lignes, un seul result set, READ ONLY"
}

# Requête d'identification des comptes élèves sans mapping : lecture seule et
# exécutable telle quelle (elle contient des e-mails, donc jamais dans un log
# partagé — on ne vérifie que son exécution).
legacy_students_readonly() {
  { echo "BEGIN READ ONLY;";
    cat "$ROOT/docs/CTO_005A_LEGACY_STUDENT_ACCOUNTS.sql";
    echo "COMMIT;"; } \
    | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres > /dev/null \
    || { echo "LEGACY STUDENT QUERY FAILED" >&2; return 12; }
  echo "→ docs/CTO_005A_LEGACY_STUDENT_ACCOUNTS.sql : exécutable, READ ONLY"
}

# Revue CTO finale §C : precheck dédié à ensure_profile, une seule instruction,
# strictement en lecture. Il doit passer que la fonction existe ou non.
ensure_profile_readonly() {
  local rows
  rows=$({ echo "BEGIN READ ONLY;";
           cat "$ROOT/docs/CTO_005_ENSURE_PROFILE_PRECHECK.sql";
           echo "COMMIT;"; } \
    | docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -t -A -q -U postgres -d postgres 2>&1) \
    || { echo "ENSURE_PROFILE PRECHECK FAILED: $rows" >&2; return 15; }
  echo "→ docs/CTO_005_ENSURE_PROFILE_PRECHECK.sql : $(grep -c '|' <<<"$rows") ligne(s), un seul result set, READ ONLY"
}

run_suite() {
  local apply_migrations="$1"
  local apply_safe_rollback="${2:-no}"
  local production_like="${3:-no}"
  start_db
  psql_file "$ROOT/tests/rls/00_bootstrap_supabase.sql"
  psql_file "$ROOT/tests/rls/01_baseline_legacy.sql"

  # Variante PRODUCTION-COMPATIBILITY : types et objets réellement observés en
  # production (rapport lecture seule), aucune donnée de production.
  if [ "$production_like" = "yes" ]; then
    psql_file "$ROOT/tests/rls/03_production_like.sql" \
      || { echo "PRODUCTION-LIKE BASELINE FAILED" >&2; return 10; }
    echo "→ baseline production-like appliquée ($(secdef_exposed) SECURITY DEFINER exposée(s) avant migrations)"
  fi

  # Le precheck production doit être exécutable d'un seul bloc et strictement en
  # lecture : on le joue INTÉGRALEMENT sur le schéma AVANT migrations (c'est son
  # contexte réel), dans une transaction en lecture seule qui rejetterait toute
  # écriture.
  if [ "$apply_migrations" = "yes" ]; then
    precheck_readonly || return 5
    report_readonly || return 9
    ensure_profile_readonly || return 15
  fi

  if [ "$apply_migrations" = "yes" ]; then
    for f in "$ROOT"/supabase/migrations/*.sql; do
      echo "→ $(basename "$f")"
      psql_file "$f" || { echo "MIGRATION FAILED: $f" >&2; return 3; }
    done
  fi

  if [ "$apply_safe_rollback" = "yes" ]; then
    local sr="$ROOT/supabase/migrations/rollback/20260810_cto005_safe_rollback.sql"
    echo "→ rollback/$(basename "$sr")"
    psql_file "$sr" || { echo "SAFE ROLLBACK FAILED: $sr" >&2; return 6; }
  fi

  psql_file "$ROOT/tests/rls/02_fixtures.sql"

  if [ "$apply_migrations" = "yes" ]; then
    # le rapport doit aussi passer sur le schéma durci, pas seulement avant
    report_readonly || return 9
  fi

  if [ "$apply_migrations" = "yes" ]; then
    # état cible : la moindre attaque réussie doit faire échouer la suite
    docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -t -A -q -U postgres -d postgres \
      < "$ROOT/tests/rls/10_attacks.sql" || return 3
    if [ "$production_like" = "yes" ]; then
      echo "→ SECURITY DEFINER exposée(s) après migrations : $(secdef_exposed)"
      docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -t -A -q -U postgres -d postgres \
        < "$ROOT/tests/rls/30_production_like_checks.sql" \
        || { echo "PRODUCTION-COMPATIBILITY CHECKS FAILED" >&2; return 11; }
    fi
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

# Revue CTO finale §B/§D : le precheck doit tourner sans adaptation sur les deux
# nommages historiques de la colonne de date des entrées Grande Salle.
precheck_variants() {
  start_db
  psql_file "$ROOT/tests/rls/00_bootstrap_supabase.sql"
  psql_file "$ROOT/tests/rls/01_baseline_legacy.sql"
  psql_file "$ROOT/tests/rls/02_fixtures.sql"
  echo "=== PRECHECK — variante gs_tournament_entries.joined_at ==="
  precheck_readonly || return 5
  report_readonly || return 9
  legacy_students_readonly || return 12
  ensure_profile_readonly || return 15

  echo "=== PRECHECK — variante gs_tournament_entries.created_at ==="
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <<'SQL'
ALTER TABLE public.gs_tournament_entries RENAME COLUMN joined_at TO created_at;
SQL
  precheck_readonly || return 5
  report_readonly || return 9

  # Variante extrême : base historique sans périmètre institutionnel ni date de
  # création sur user_profiles, et sans aucune colonne de date sur les entrées.
  echo "=== PRECHECK — variante sans region/circonscription_id/created_at ==="
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <<'SQL'
ALTER TABLE public.user_profiles DROP COLUMN region;
ALTER TABLE public.user_profiles DROP COLUMN circonscription_id;
ALTER TABLE public.user_profiles DROP COLUMN created_at;
ALTER TABLE public.gs_tournament_entries DROP COLUMN created_at;
SQL
  precheck_readonly || return 5
  report_readonly || return 9
  # ensure_profile n'existe pas dans la baseline du dépôt : le precheck doit
  # néanmoins passer et le dire, sans erreur SQL.
  ensure_profile_readonly || return 15
}

# Revue CTO finale §C3 : contraintes CHECK de rôle legacy → 1200 → cpd/cpc.
role_constraints_suite() {
  start_db
  psql_file "$ROOT/tests/rls/00_bootstrap_supabase.sql"
  psql_file "$ROOT/tests/rls/01_baseline_legacy.sql"
  echo "=== CONTRAINTES LEGACY (génération rectorat, sans cpd/cpc) ==="
  psql_file "$ROOT/tests/rls/05_legacy_role_constraints.sql" \
    || { echo "LEGACY ROLE CONSTRAINTS FAILED" >&2; return 7; }

  for f in "$ROOT"/supabase/migrations/*.sql; do
    psql_file "$f" >/dev/null || { echo "MIGRATION FAILED: $f" >&2; return 3; }
  done
  psql_file "$ROOT/tests/rls/02_fixtures.sql"

  echo "=== APRÈS MIGRATION 1200 ==="
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -t -A -q -U postgres -d postgres \
    < "$ROOT/tests/rls/20_role_constraints.sql" \
    || { echo "ROLE CONSTRAINT TESTS FAILED" >&2; return 7; }
}

# La migration 1200 ne doit jamais convertir un rôle historique : sur une base
# contenant une valeur hors whitelist, elle doit s'arrêter explicitement.
role_constraints_fail_closed() {
  start_db
  psql_file "$ROOT/tests/rls/00_bootstrap_supabase.sql"
  psql_file "$ROOT/tests/rls/01_baseline_legacy.sql"
  docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres <<'SQL'
INSERT INTO auth.users (id, email) VALUES
  ('00000000-0000-0000-0000-0000000000ee', 'legacy-superadmin@example.test');
INSERT INTO user_profiles (id, email, role) VALUES
  ('00000000-0000-0000-0000-0000000000ee', 'legacy-superadmin@example.test', 'superadmin');
SQL
  local out
  out=$(docker exec -i "$CONTAINER" psql -v ON_ERROR_STOP=1 -q -U postgres -d postgres \
        < "$ROOT/supabase/migrations/20260810_1200_cto005_role_constraints.sql" 2>&1)
  if grep -q 'hors whitelist' <<<"$out"; then
    echo "NOTICE:  PASS 1200 fail-closed sur un rôle hors whitelist : superadmin"
  else
    echo "FAIL 1200 aurait dû refuser de tourner : $out" >&2
    return 8
  fi
  # Aucune conversion automatique : la donnée historique est intacte.
  local still
  still=$(docker exec -i "$CONTAINER" psql -t -A -q -U postgres -d postgres \
          -c "SELECT role FROM user_profiles WHERE id = '00000000-0000-0000-0000-0000000000ee'")
  if [ "$still" != "superadmin" ]; then
    echo "FAIL 1200 a modifié un rôle historique (: $still)" >&2
    return 8
  fi
  echo "NOTICE:  PASS 1200 ne convertit aucun rôle historique"
}

# Revue CTO finale §E/§J : le schéma production réel, migré de bout en bout.
production_like_suite() {
  echo "=== BASELINE PRODUCTION-LIKE (types et expositions réels) ==="
  run_suite yes no yes
  local rc=$?
  [ $rc -ne 0 ] && return $rc
  concurrency_test || return 4
  echo "=== PRECHECK ensure_profile (lecture seule) ==="
  ensure_profile_readonly || return 15
  echo "=== DEFAULT PRIVILEGES (fonctions futures du rôle de migration) ==="
  default_privileges_test || return 13
  echo "=== ALLOWLIST EXACTE DE L'ASSERTION 1300 ==="
  secdef_allowlist_test || return 14
  echo "=== PRODUCTION-LIKE + SAFE ROLLBACK (les attaques doivent RESTER bloquées) ==="
  run_suite yes yes yes
  rc=$?
  [ $rc -ne 0 ] && return $rc
  concurrency_test || return 4
}

if [ "$MODE" = "prodlike" ]; then
  production_like_suite
  rc=$?
  [ $rc -eq 0 ] && echo "PRODUCTION-COMPATIBILITY TESTS: PASSED" \
                || echo "PRODUCTION-COMPATIBILITY TESTS: FAILED (exit=$rc)"
  exit $rc
fi

if [ "$MODE" = "precheck" ]; then
  precheck_variants
  rc=$?
  [ $rc -eq 0 ] && echo "PRECHECK VARIANTS: PASSED" || echo "PRECHECK VARIANTS: FAILED (exit=$rc)"
  exit $rc
fi

if [ "$MODE" = "roles" ]; then
  role_constraints_suite && role_constraints_fail_closed
  rc=$?
  [ $rc -eq 0 ] && echo "ROLE CONSTRAINT TESTS: PASSED" || echo "ROLE CONSTRAINT TESTS: FAILED (exit=$rc)"
  exit $rc
fi

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

if [ "$MODE" = "migrated" ]; then echo "RLS TESTS: PASSED"; exit 0; fi

# Revue CTO §I : le safe rollback ne doit JAMAIS réouvrir une faille P0/P1.
# On rejoue donc l'intégralité des attaques après l'avoir appliqué.
echo "=== APRÈS SAFE ROLLBACK (les attaques doivent RESTER bloquées) ==="
run_suite yes yes
rc=$?
if [ $rc -ne 0 ]; then
  echo "RLS TESTS: FAILED (safe rollback, exit=$rc)"
  exit $rc
fi

concurrency_test
rc=$?
if [ $rc -ne 0 ]; then
  echo "RLS TESTS: FAILED (safe rollback, exit=$rc)"
  exit $rc
fi
echo "RLS TESTS: PASSED"
