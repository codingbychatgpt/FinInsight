#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)"
DEPLOY_DIR="${ROOT_DIR}/deploy"

if [[ ! -f "${DEPLOY_DIR}/.env.production" ]]; then
  echo "Missing ${DEPLOY_DIR}/.env.production"
  echo "Copy deploy/.env.production.example and replace all placeholder secrets first."
  exit 1
fi

cd "${ROOT_DIR}/FinInsight-Frontend"
npm ci
npm run build:h5:prod

mkdir -p /opt/fininsight/frontend/dist
rsync -a --delete "${ROOT_DIR}/FinInsight-Frontend/dist/" /opt/fininsight/frontend/dist/

cd "${DEPLOY_DIR}"
docker compose --env-file .env.production -f docker-compose.production.yml up -d --build --pull never

install -m 0644 nginx/52zzx.top.conf /etc/nginx/sites-available/52zzx.top
ln -sfn /etc/nginx/sites-available/52zzx.top /etc/nginx/sites-enabled/52zzx.top
rm -f /etc/nginx/sites-enabled/default

nginx -t
systemctl reload nginx

echo "Deployment completed."
echo "Check: curl http://127.0.0.1:8000/api/v1/health"
