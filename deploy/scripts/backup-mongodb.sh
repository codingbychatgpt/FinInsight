#!/usr/bin/env bash
set -euo pipefail

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_DIR="${BACKUP_DIR:-/opt/fininsight/backups}"
STAMP="$(date +%Y%m%d-%H%M%S)"

mkdir -p "${BACKUP_DIR}"
cd "${DEPLOY_DIR}"
set -a
source .env.production
set +a

docker compose --env-file .env.production -f docker-compose.production.yml exec -T mongo \
  mongodump \
  --username "${MONGO_ROOT_USERNAME}" \
  --password "${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase admin \
  --db "${MONGO_DB_NAME}" \
  --archive \
  --gzip > "${BACKUP_DIR}/fininsight-${STAMP}.archive.gz"

find "${BACKUP_DIR}" -type f -name 'fininsight-*.archive.gz' -mtime +14 -delete
echo "Backup created: ${BACKUP_DIR}/fininsight-${STAMP}.archive.gz"
