#!/bin/sh
# Patch repo-root .env with ERP_MASTER_PASSWORD_HASH (Docker Compose $$ escaping).
# No Node.js on the host required — uses the backend container to bcrypt-hash.
#
# Usage (EC2, from repo root):
#   sh scripts/set-master-password-env.sh "Karhan@974"
#   docker compose up -d backend
set -e

PASSWORD="$1"
ROOT="$(CDPATH= cd "$(dirname "$0")/.." && pwd)"
ENV_FILE="$ROOT/.env"

if [ -z "$PASSWORD" ]; then
  echo 'Usage: sh scripts/set-master-password-env.sh "your-master-password"'
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Missing $ENV_FILE — copy .env.example to .env first."
  exit 1
fi

cd "$ROOT"

echo "Generating bcrypt hash via backend container..."
HASH="$(docker compose exec -T backend node apps/backend/scripts/hash-master-password.cjs "$PASSWORD" | tr -d '\r\n')"

case "$HASH" in
  \$2*) ;;
  *)
    echo "Unexpected hash output: $HASH"
    exit 1
    ;;
esac

COMPOSE_ESC="$(printf '%s' "$HASH" | sed 's/\$/$$/g')"

TMP="$(mktemp)"
grep -Ev '^(ERP_MASTER_PASSWORD|ERP_MASTER_PASSWORD_HASH)=' "$ENV_FILE" > "$TMP" || true
printf '%s\n' "# Master portal password hash — set via: sh scripts/set-master-password-env.sh" >> "$TMP"
printf '%s\n' "ERP_MASTER_PASSWORD_HASH=\"$COMPOSE_ESC\"" >> "$TMP"
mv "$TMP" "$ENV_FILE"

echo "Updated $ENV_FILE"
echo "  - removed ERP_MASTER_PASSWORD / ERP_MASTER_PASSWORD_HASH if present"
echo "  - wrote ERP_MASTER_PASSWORD_HASH with Docker-safe escaping"
echo ""
echo "Next:"
echo "  docker compose up -d backend"
echo "  docker compose exec backend printenv ERP_MASTER_PASSWORD_HASH"
