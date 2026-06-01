#!/bin/bash
# ============================================================
#  Handball Trainer - Proxmox LXC Installer
#  Einfach als root im LXC ausführen:
#    bash install.sh
# ============================================================

set -euo pipefail

RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; CYAN='\033[0;36m'; NC='\033[0m'
info()    { echo -e "${CYAN}  [INFO]${NC} $1"; }
success() { echo -e "${GREEN}  [OK]${NC}   $1"; }
warn()    { echo -e "${YELLOW}  [WARN]${NC} $1"; }
error()   { echo -e "${RED}  [FEHLER]${NC} $1"; exit 1; }

echo ""
echo -e "${CYAN}  ============================================${NC}"
echo -e "${CYAN}   🤾 Handball Trainer - Installation${NC}"
echo -e "${CYAN}  ============================================${NC}"
echo ""

[ "$EUID" -ne 0 ] && error "Bitte als root ausführen: sudo bash install.sh"

APP_DIR="/opt/handball"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

info "System aktualisieren..."
apt-get update -qq

info "Node.js 20 LTS installieren..."
if ! command -v node &>/dev/null; then
  apt-get install -y -qq curl ca-certificates
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash - > /dev/null 2>&1
  apt-get install -y -qq nodejs
fi
success "Node.js $(node --version) installiert"

info "App-Dateien einrichten..."
mkdir -p "$APP_DIR/server" "$APP_DIR/public" "$APP_DIR/data/uploads"
cp "$SCRIPT_DIR/server/index.js"  "$APP_DIR/server/index.js"
cp "$SCRIPT_DIR/public/index.html" "$APP_DIR/public/index.html"
cp "$SCRIPT_DIR/package.json"      "$APP_DIR/package.json"

chown -R root:root "$APP_DIR"
chmod -R 755 "$APP_DIR"
chmod 777 "$APP_DIR/data" "$APP_DIR/data/uploads"
success "App-Dateien kopiert nach $APP_DIR"

info "Node.js Pakete installieren..."
cd "$APP_DIR"
npm install --omit=dev --silent
success "Pakete installiert"

info "Systemd-Service einrichten..."
cat > /etc/systemd/system/handball.service <<'SERVICE'
[Unit]
Description=Handball Trainer
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/handball
ExecStart=/usr/bin/node server/index.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000
Environment=DB_PATH=/opt/handball/data/handball.db
Environment=UPLOADS=/opt/handball/data/uploads
Environment=PUBLIC_DIR=/opt/handball/public

[Install]
WantedBy=multi-user.target
SERVICE

systemctl daemon-reload
systemctl enable handball > /dev/null 2>&1
systemctl restart handball
sleep 2

if systemctl is-active --quiet handball; then
  success "Service läuft!"
else
  error "Service konnte nicht gestartet werden. Logs: journalctl -u handball -n 20"
fi

IP=$(hostname -I | awk '{print $1}')

echo ""
echo -e "${GREEN}  ============================================${NC}"
echo -e "${GREEN}   Installation erfolgreich!${NC}"
echo -e "${GREEN}  ============================================${NC}"
echo ""
echo -e "  Öffne im Browser:"
echo -e "  ${CYAN}http://${IP}:3000${NC}"
echo ""
echo -e "  Nützliche Befehle:"
echo -e "  ${YELLOW}systemctl status handball${NC}    — Status prüfen"
echo -e "  ${YELLOW}systemctl restart handball${NC}   — Neustart"
echo -e "  ${YELLOW}journalctl -u handball -f${NC}    — Live-Logs"
echo -e "  ${YELLOW}ls /opt/handball/data/${NC}       — DB & Uploads"
echo ""
