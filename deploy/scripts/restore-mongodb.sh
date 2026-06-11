#!/usr/bin/env bash
set -euo pipefail

if [[ $# -ne 1 ]]; then
  echo "Usage: $0 /path/to/fininsight-backup.archive.gz"
  exit 1
fi

DEPLOY_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
BACKUP_FILE="$1"

cd "${DEPLOY_DIR}"
set -a
source .env.production
set +a

docker compose --env-file .env.production -f docker-compose.production.yml exec -T mongo \
  mongorestore \
  --username "${MONGO_ROOT_USERNAME}" \
  --password "${MONGO_ROOT_PASSWORD}" \
  --authenticationDatabase admin \
  --archive \
  --gzip \
  --drop < "${BACKUP_FILE}"

echo "Restore completed from: ${BACKUP_FILE}"
