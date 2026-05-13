#!/bin/bash
# =========================================================
# FM App — Manual Deploy (testing branch) to EC2
# Run this in the EC2 Instance Connect browser terminal
# =========================================================
set -euo pipefail
APP_ROOT="/var/www/fmapp"
BACKEND_DIR="$APP_ROOT/backend"
FRONTEND_DIR="$APP_ROOT/frontend"

echo "=== [1/6] Pull testing branch ==="
cd "$APP_ROOT"
git fetch origin
git checkout testing
git pull origin testing

echo "=== [2/6] Install backend dependencies ==="
cd "$BACKEND_DIR"
sudo npm ci --omit=dev

echo "=== [3/6] Run SQL migrations ==="
set -a; source "$BACKEND_DIR/.env"; set +a
node "$BACKEND_DIR/run-migrations.js"

echo "=== [4/6] Build frontend ==="
cd "$APP_ROOT/frontend"
npm install
VITE_API_URL="" npm run build

echo "=== [5/6] Copy frontend dist to nginx root ==="
sudo rm -rf "$FRONTEND_DIR"
sudo cp -r "$APP_ROOT/frontend/dist/." "$FRONTEND_DIR/"

echo "=== [6/6] Restart PM2 backend ==="
pm2 restart fmapp-backend 2>/dev/null || \
  pm2 start "$APP_ROOT/ec2/pm2.ecosystem.config.js" --env production
pm2 save --force

echo ""
echo "=== Deploy complete! ==="
pm2 status
