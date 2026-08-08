#!/usr/bin/env bash
set -euo pipefail

APP_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
NODE_BIN="$(command -v node)"
DATA_DIR="${XDG_DATA_HOME:-$HOME/.local/share}/br-manager"
CONFIG_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/br-manager"
UNIT_DIR="${XDG_CONFIG_HOME:-$HOME/.config}/systemd/user"
ENV_FILE="$CONFIG_DIR/env"
UNIT_FILE="$UNIT_DIR/br-manager.service"

if [[ "$(node -p 'Number(process.versions.node.split(`.`)[0])')" -lt 22 ]]; then
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

install -d -m 0700 "$DATA_DIR" "$DATA_DIR/uploads" "$CONFIG_DIR"
install -d -m 0755 "$UNIT_DIR"
BOOTSTRAP_PASSWORD=""
if [[ ! -f "$ENV_FILE" ]]; then
  BOOTSTRAP_PASSWORD="$(openssl rand -base64 18 | tr -d '/+=' | head -c 20)Aa1!"
  {
    printf 'NODE_ENV=production\n'
    printf 'HOST=127.0.0.1\n'
    printf 'PORT=3000\n'
    printf 'DATABASE_PATH=%s/br-manager.db\n' "$DATA_DIR"
    printf 'UPLOAD_DIR=%s/uploads\n' "$DATA_DIR"
    printf 'SESSION_SECRET=%s\n' "$(openssl rand -hex 32)"
    printf 'FILE_ENCRYPTION_KEY=%s\n' "$(openssl rand -base64 32 | tr -d '\n')"
    printf 'BOOTSTRAP_ADMIN_EMAIL=admin@betriebsrat.local\n'
    printf 'BOOTSTRAP_ADMIN_PASSWORD=%s\n' "$BOOTSTRAP_PASSWORD"
    printf 'BOOTSTRAP_COUNCIL_NAME=Betriebsrat\n'
    printf 'SEED_DEMO_DATA=true\n'
    printf 'TRUST_PROXY=false\n'
    printf 'COOKIE_SECURE=false\n'
  } > "$ENV_FILE"
  chmod 0600 "$ENV_FILE"
fi

TEMP_UNIT="$(mktemp)"
sed -e "s|@@APP_DIR@@|$APP_DIR|g" -e "s|@@NODE_BIN@@|$NODE_BIN|g" -e "s|@@ENV_FILE@@|$ENV_FILE|g" -e "s|@@DATA_DIR@@|$DATA_DIR|g" "$APP_DIR/deploy/br-manager-user.service.in" > "$TEMP_UNIT"
install -m 0644 "$TEMP_UNIT" "$UNIT_FILE"
rm -f "$TEMP_UNIT"

systemctl --user daemon-reload
systemctl --user enable --now br-manager.service
systemctl --user --no-pager --full status br-manager.service

echo
echo "BR Manager: http://127.0.0.1:3000"
if [[ -n "$BOOTSTRAP_PASSWORD" ]]; then
  echo "Initialer Zugang: admin@betriebsrat.local"
  echo "Initialpasswort: $BOOTSTRAP_PASSWORD"
  echo "Das Passwort muss nach der ersten Anmeldung geändert werden."
else
  echo "Die bestehende Konfiguration $ENV_FILE wurde beibehalten."
fi
