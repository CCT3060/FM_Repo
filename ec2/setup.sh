#!/usr/bin/env bash
# =============================================================================
# EC2 One-Time Setup Script for FM_Instance (Amazon Linux 2023, ap-south-1)
# =============================================================================
# Run this ONCE after launching the EC2 instance:
#   chmod +x setup.sh && sudo ./setup.sh
#
# What this script does:
#   1. Installs Node.js 22 (via NodeSource), PM2, and Nginx
#   2. Creates the application directory structure
#   3. Places the Nginx config
#   4. Copies the PM2 ecosystem config and sets PM2 to start on boot
# =============================================================================

set -euo pipefail

APP_ROOT="/var/www/fmapp"
LOG_DIR="/var/log/fmapp"
NGINX_CONF="/etc/nginx/conf.d/fmapp.conf"

echo "=== [1/7] Updating system packages ==="
dnf update -y

echo "=== [2/7] Installing Node.js 22 ==="
curl -fsSL https://rpm.nodesource.com/setup_22.x | bash -
dnf install -y nodejs

echo "=== [3/7] Installing Nginx ==="
dnf install -y nginx

echo "=== [4/7] Installing PM2 globally ==="
npm install -g pm2

echo "=== [5/7] Creating application directories ==="
mkdir -p "${APP_ROOT}/frontend"
mkdir -p "${APP_ROOT}/backend/uploads"
mkdir -p "${APP_ROOT}/ec2"
mkdir -p "${LOG_DIR}"
chown -R ec2-user:ec2-user "${APP_ROOT}"
chown -R ec2-user:ec2-user "${LOG_DIR}"

echo "=== [6/7] Configuring Nginx ==="
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cp "${SCRIPT_DIR}/nginx.conf" "${NGINX_CONF}"
cp "${SCRIPT_DIR}/pm2.ecosystem.config.js" "${APP_ROOT}/ec2/pm2.ecosystem.config.js"

# Remove default welcome page
rm -f /etc/nginx/conf.d/welcome.conf

nginx -t
systemctl enable nginx
systemctl restart nginx

echo "=== [7/7] Registering PM2 to start on system boot ==="
su - ec2-user -c "pm2 startup systemd -u ec2-user --hp /home/ec2-user" | tail -1 | bash || true

echo ""
echo "========================================================"
echo "  EC2 setup complete!"
echo ""
echo "  Next steps:"
echo "  1. Create /var/www/fmapp/backend/.env with your secrets:"
echo "     DATABASE_URL, JWT_SECRET, ALLOW_ORIGIN, PORT=4000, etc."
echo ""
echo "  2. Add GitHub Secrets: EC2_HOST, EC2_USER, EC2_SSH_KEY"
echo "  3. Push to trigger GitHub Actions deploy"
echo "========================================================"
