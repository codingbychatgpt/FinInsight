#!/usr/bin/env bash
set -euo pipefail

if [[ "${EUID}" -ne 0 ]]; then
  echo "Run this script as root."
  exit 1
fi

apt-get update
apt-get install -y curl ca-certificates nginx apache2-utils certbot python3-certbot-nginx docker.io docker-compose-plugin rsync

curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
apt-get install -y nodejs

mkdir -p /opt/fininsight/frontend/dist
mkdir -p /opt/fininsight/backups

systemctl enable --now docker
systemctl enable --now nginx

echo "Server prerequisites installed."
node --version
npm --version
docker --version
echo "Next: upload the repository to /opt/fininsight and follow deploy/README.md."
