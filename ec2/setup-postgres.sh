#!/usr/bin/env bash
# =============================================================================
# EC2 PostgreSQL 15 Setup + Supabase Data Migration
# Amazon Linux 2023, ap-south-1
# =============================================================================
# USAGE:
#   sudo bash setup-postgres.sh <db-password> [supabase-direct-url]
#
# ARGUMENTS:
#   db-password          Password for the local 'fmapp' PostgreSQL user (required)
#   supabase-direct-url  Full Supabase direct connection URL to import existing
#                        data (optional — skip for fresh installs).
#                        Format: postgresql://postgres:<pass>@db.<ref>.supabase.co:5432/postgres
#
# EXAMPLES:
#   # Fresh install (schema only, no data):
#   sudo bash setup-postgres.sh "MyStr0ngPass!"
#
#   # Fresh install + migrate existing Supabase data:
#   sudo bash setup-postgres.sh "MyStr0ngPass!" \
#     "postgresql://postgres:mypass@db.qcotfnxeategohbczekl.supabase.co:5432/postgres"
#
# AFTER RUNNING:
#   Update /var/www/fmapp/backend/.env:
#     DATABASE_URL=postgresql://fmapp:<db-password>@localhost:5432/fmapp
#     SUPABASE_DB_SSL=disable
#   Then: pm2 restart fmapp-backend
# =============================================================================

set -euo pipefail

if [[ $# -lt 1 ]]; then
  echo "Usage: sudo bash $0 <db-password> [supabase-direct-url]" >&2
  exit 1
fi

DB_PASSWORD="$1"
SUPABASE_URL="${2:-}"
DB_NAME="fmapp"
DB_USER="fmapp"
PG_VERSION="15"
APP_ROOT="/var/www/fmapp"
SCHEMA_FILE="${APP_ROOT}/backend/sql/supabase/schema.sql"

echo "=== [1/6] Installing PostgreSQL ${PG_VERSION} ==="
dnf install -y "postgresql${PG_VERSION}-server" "postgresql${PG_VERSION}"

echo "=== [2/6] Initialising database cluster ==="
if [[ ! -f "/var/lib/pgsql/${PG_VERSION}/data/PG_VERSION" ]]; then
  "postgresql-${PG_VERSION}-setup" initdb
else
  echo "  (cluster already initialised, skipping)"
fi

echo "=== [3/6] Enabling password auth (scram-sha-256) in pg_hba.conf ==="
PG_HBA="/var/lib/pgsql/${PG_VERSION}/data/pg_hba.conf"
# Replace peer/ident with scram-sha-256 for local connections
sed -i \
  -e 's/^\(local\s\+all\s\+all\s\+\)\(peer\|ident\)/\1scram-sha-256/' \
  -e 's/^\(host\s\+all\s\+all\s\+127\.0\.0\.1\/32\s\+\)\(ident\)/\1scram-sha-256/' \
  -e 's/^\(host\s\+all\s\+all\s\+::1\/128\s\+\)\(ident\)/\1scram-sha-256/' \
  "${PG_HBA}"

echo "=== [4/6] Starting PostgreSQL and creating user + database ==="
systemctl enable --now "postgresql-${PG_VERSION}"

# Create role if it doesn't exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_roles WHERE rolname='${DB_USER}'" \
  | grep -q 1 || sudo -u postgres psql -c \
    "CREATE USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# Update password in case it changed
sudo -u postgres psql -c \
  "ALTER USER ${DB_USER} WITH PASSWORD '${DB_PASSWORD}';"

# Create database if it doesn't exist
sudo -u postgres psql -tc "SELECT 1 FROM pg_database WHERE datname='${DB_NAME}'" \
  | grep -q 1 || sudo -u postgres psql -c \
    "CREATE DATABASE ${DB_NAME} OWNER ${DB_USER} ENCODING 'UTF8' LC_COLLATE 'en_US.UTF-8' LC_CTYPE 'en_US.UTF-8' TEMPLATE template0;"

sudo -u postgres psql -c \
  "GRANT ALL PRIVILEGES ON DATABASE ${DB_NAME} TO ${DB_USER};"

echo "=== [5/6] Migrating data ==="
if [[ -n "${SUPABASE_URL}" ]]; then
  echo "  Exporting data from Supabase (this may take a minute)..."
  DUMP_FILE="/tmp/fmapp_supabase_dump.dump"

  # Export: use custom format for faster restore; exclude Supabase internals
  PGSSLMODE=require pg_dump "${SUPABASE_URL}" \
    --format=custom \
    --no-owner \
    --no-acl \
    --exclude-schema='storage' \
    --exclude-schema='graphql_public' \
    --exclude-schema='realtime' \
    --exclude-schema='supabase_functions' \
    --exclude-schema='_analytics' \
    --exclude-schema='pgbouncer' \
    --exclude-schema='vault' \
    --exclude-schema='auth' \
    --exclude-schema='extensions' \
    -f "${DUMP_FILE}"

  echo "  Importing into local fmapp database..."
  PGPASSWORD="${DB_PASSWORD}" pg_restore \
    --host=localhost \
    --port=5432 \
    --username="${DB_USER}" \
    --dbname="${DB_NAME}" \
    --no-owner \
    --no-acl \
    --clean \
    --if-exists \
    "${DUMP_FILE}"

  rm -f "${DUMP_FILE}"
  echo "  Data migration complete."
else
  echo "  No Supabase URL provided — applying schema only (fresh install)."
  if [[ -f "${SCHEMA_FILE}" ]]; then
    PGPASSWORD="${DB_PASSWORD}" psql \
      --host=localhost \
      --port=5432 \
      --username="${DB_USER}" \
      --dbname="${DB_NAME}" \
      -f "${SCHEMA_FILE}"
    echo "  Schema applied."
  else
    echo "  WARNING: ${SCHEMA_FILE} not found. Deploy the backend code first." >&2
  fi
fi

echo "=== [6/6] Granting schema permissions ==="
sudo -u postgres psql -d "${DB_NAME}" -c \
  "GRANT ALL ON SCHEMA public TO ${DB_USER}; \
   GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO ${DB_USER}; \
   GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO ${DB_USER}; \
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON TABLES TO ${DB_USER}; \
   ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT ALL ON SEQUENCES TO ${DB_USER};"

echo ""
echo "========================================================"
echo "  PostgreSQL setup complete!"
echo ""
echo "  Update /var/www/fmapp/backend/.env with:"
echo ""
echo "    DATABASE_URL=postgresql://${DB_USER}:${DB_PASSWORD}@localhost:5432/${DB_NAME}"
echo "    SUPABASE_DB_SSL=disable"
echo ""
echo "  Then restart the backend:"
echo "    pm2 restart fmapp-backend"
echo ""
echo "  Verify connectivity:"
echo "    PGPASSWORD='${DB_PASSWORD}' psql -U ${DB_USER} -d ${DB_NAME} -h localhost -c '\dt'"
echo "========================================================"
