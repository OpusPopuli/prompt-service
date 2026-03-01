#!/bin/sh
set -eu

# Custom migrate.sh for Vault-only usage of the supabase/postgres image.
# Runs the built-in init-scripts (which create required roles like service_role,
# anon, authenticated) but skips the migrations directory (which contains
# demote-postgres.sql that fails because PostgreSQL cannot remove SUPERUSER
# from the bootstrap superuser).

export PGDATABASE="${POSTGRES_DB:-postgres}"
export PGHOST="${POSTGRES_HOST:-localhost}"
export PGPORT="${POSTGRES_PORT:-5432}"
export PGPASSWORD="${POSTGRES_PASSWORD:-}"

db=$( cd -- "$( dirname -- "$0" )" > /dev/null 2>&1 && pwd )

# Run init scripts as postgres user (creates roles, schemas, etc.)
for sql in "$db"/init-scripts/*.sql; do
    echo "$0: running $sql"
    psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc -U postgres -f "$sql"
done

# Set supabase_admin password (required by init-scripts references)
psql -v ON_ERROR_STOP=1 --no-password --no-psqlrc -U postgres -c "ALTER USER supabase_admin WITH PASSWORD '$PGPASSWORD'"

# Skip migrations/*.sql — the demote-postgres migration is incompatible
# with our setup where postgres is the bootstrap superuser.
echo "$0: skipping migrations (not needed for Vault-only usage)"
