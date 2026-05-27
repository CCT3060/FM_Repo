#!/usr/bin/env bash
# =============================================================================
# FM App — EC2 Deploy Script
# Run on the EC2 instance after pushing to GitHub:
#   ssh ec2-user@<your-ec2-ip> "bash /var/www/fmapp/ec2/deploy.sh"
# Or copy-paste the commands below into your SSH session.
# =============================================================================
set -euo pipefail

APP_ROOT="/var/www/fmapp"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"

echo "=== [1/5] Pull latest code from GitHub ==="
cd "$APP_ROOT"
git pull origin develop

echo "=== [2/5] Install backend dependencies ==="
cd "$BACKEND_DIR"
npm install --omit=dev

echo "=== [3/5] Run pending SQL migrations ==="
# Reads DB credentials from backend/.env
set -a; source "$BACKEND_DIR/.env"; set +a

# Run only migrations newer than the last recorded one.
# Simple approach: run each migration file through mysql; errors are ignored
# if the column/table already exists (MySQL returns error but continues).
MIGRATIONS_DIR="$APP_ROOT/backend/sql/migrations"
for f in $(ls "$MIGRATIONS_DIR"/*.sql | sort); do
  echo "  Applying $f ..."
  mysql -h "$DB_HOST" -P "${DB_PORT:-3306}" -u "$DB_USER" -p"$DB_PASSWORD" "$DB_NAME" \
    --force < "$f" 2>&1 | grep -v "^$" || true
done

echo "=== [4/5] Build frontend ==="
cd "$APP_ROOT/frontend"
npm install
npm run build
# Nginx now serves directly from dist/ — no copy needed.
# (Previous rsync/rm approach caused the dist/ dir to be deleted mid-copy.)

echo "=== [5/5] Restart backend with PM2 ==="
cd "$BACKEND_DIR"
pm2 reload fmapp-backend --update-env || pm2 start "$APP_ROOT/ec2/pm2.ecosystem.config.js" --env production

echo "=== Deploy complete! ==="
pm2 status
