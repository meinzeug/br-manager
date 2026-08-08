#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
APP_USER="${SUDO_USER:-$(id -un)}"
APP_GROUP="$(id -gn "$APP_USER")"
DATA_DIR="/var/lib/br-manager"
ENV_FILE="/etc/br-manager.env"
UNIT_FILE="/etc/systemd/system/br-manager.service"

if ! command -v node >/dev/null || [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 22 ]]; then
  echo "Node.js 22 oder neuer ist erforderlich." >&2
  exit 1
fi
if ! command -v openssl >/dev/null; then
  echo "openssl ist zur sicheren Schlüsselerzeugung erforderlich." >&2
  exit 1
fi

cd "$APP_DIR"
npm ci
npm run build

sudo install -d -m 0700 -o "$APP_USER" -g "$APP_GROUP" "$DATA_DIR" "$DATA_DIR/uploads"

BOOTSTRAP_PASSWORD=""
if [[ ! -f "$ENV_FILE" ]]; then
  BOOTSTRAP_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)Aa1!"
  TEMP_ENV="$(mktemp)"
  chmod 0600 "$TEMP_ENV"
  {
    printf 'NODE_ENV=production\n'
    printf 'HOST=127.0.0.1\n'
    printf 'PORT=3000\n'
    printf 'DATABASE_PATH=/var/lib/br-manager/br-manager.db\n'
    printf 'UPLOAD_DIR=/var/lib/br-manager/uploads\n'
    printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'FILE_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32 | tr -d '\n')"
    printf 'BOOTSTRAP_ADMIN_EMAIL=admin@betriebsrat.local\n'
    printf 'BOOTSTRAP_ADMIN_PASSWORD=%s\n' "$BOOTSTRAP_PASSWORD"
    printf 'BOOTSTRAP_COUNCIL_NAME=Betriebsrat\n'
    printf 'SEED_DEMO_DATA=true\n'
    printf 'TRUST_PROXY=false\n'
    printf 'COOKIE_SECURE=false\n'
  } > "$TEMP_ENV"
  sudo install -m 0600 -o root -g root "$TEMP_ENV" "$ENV_FILE"
  rm -f "$TEMP_ENV"
fi

TEMP_UNIT="$(mktemp)"
sed -e "s|@@APP_DIR@@|$APP_DIR|g" -e "s|@@APP_USER@@|$APP_USER|g" -e "s|@@APP_GROUP@@|$APP_GROUP|g" "$APP_DIR/deploy/br-manager.service.in" > "$TEMP_UNIT"
sudo install -m 0644 -o root -g root "$TEMP_UNIT" "$UNIT_FILE"
rm -f "$TEMP_UNIT"

sudo systemctl daemon-reload
sudo systemctl enable --now br-manager.service
sudo systemctl --no-pager --full status br-manager.service

echo
echo "BR Manager: http://127.0.0.1:3000"
if [[ -n "$BOOTSTRAP_PASSWORD" ]]; then
  echo "Initialer Zugang: admin@betriebsrat.local"
  echo "Initialpasswort: $BOOTSTRAP_PASSWORD"
  echo "Das Passwort muss nach der ersten Anmeldung geändert werden."
else
  echo "Die bestehende Konfiguration $ENV_FILE wurde beibehalten."
fi
