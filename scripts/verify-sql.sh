#!/usr/bin/env bash
# Aplica stub de Supabase + migraciones + pruebas RLS en una BD temporal de Postgres.
# Requiere variables PG* (PGHOST, PGPORT, PGUSER...) apuntando a un Postgres desechable.
set -euo pipefail
cd "$(dirname "$0")/.."
DB="nf_verify_$$"
psql -q -v ON_ERROR_STOP=1 -d postgres -c "create database $DB"
trap 'psql -q -d postgres -c "drop database if exists $DB" >/dev/null' EXIT
args=(-f supabase/tests/00_stub.sql)
for m in supabase/migrations/*.sql; do args+=(-f "$m"); done
psql -q -v ON_ERROR_STOP=1 -d "$DB" "${args[@]}"
for t in supabase/tests/[0-9][0-9]_*.sql; do
  [[ "$t" == *"00_stub.sql" ]] && continue
  psql -q -v ON_ERROR_STOP=1 -d "$DB" -f "$t"
done
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/rls.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/claim_session.sql
psql -q -v ON_ERROR_STOP=1 -d "$DB" -f supabase/tests/tools.sql
echo "SQL OK: migraciones y RLS verificadas"
