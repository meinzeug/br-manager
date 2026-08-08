#!/usr/bin/env bash
set -euo pipefail

sudo systemctl disable --now br-manager.service 2>/dev/null || true
sudo rm -f /etc/systemd/system/br-manager.service
sudo systemctl daemon-reload
echo "Der Dienst wurde entfernt. Daten und Schlüssel in /var/lib/br-manager und /etc/br-manager.env bleiben zur Wiederherstellung erhalten."
