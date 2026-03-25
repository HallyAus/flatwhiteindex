#!/bin/bash
# =============================================================================
# Flat White Index — Proxmox LXC Setup
# Run this ON your Proxmox host (not inside the container)
# =============================================================================
#
# Usage:
#   ssh root@proxmox
#   bash proxmox-setup.sh
#
# What it does:
#   1. Downloads Ubuntu 24.04 template
#   2. Creates an LXC container (ID 700)
#   3. Installs Node.js 20, git, ngrok
#   4. Clones the repo
#   5. Sets up systemd services for webhook + ngrok
#   6. Prompts you to fill in .env
#
# Prerequisites:
#   - Proxmox VE 8.x
#   - Internet access from Proxmox host
#   - Storage 'local' and 'local-lvm' available
# =============================================================================

set -e

# --- CONFIG (adjust these) ---------------------------------------------------
CTID=700
HOSTNAME="flatwhite"
MEMORY=512          # MB — Node.js is lightweight
SWAP=256
DISK=4              # GB
CORES=1
BRIDGE="vmbr0"
STORAGE="local-lvm"
TEMPLATE_STORAGE="local"
REPO="https://github.com/HallyAus/flatwhiteindex.git"
# ------------------------------------------------------------------------------

echo "☕ Flat White Index — Proxmox LXC Setup"
echo "======================================="
echo ""

# Step 1: Download Ubuntu 24.04 template if not present
TEMPLATE="ubuntu-24.04-standard_24.04-2_amd64.tar.zst"
if ! pveam list "$TEMPLATE_STORAGE" | grep -q "ubuntu-24.04"; then
  echo "📦 Downloading Ubuntu 24.04 template..."
  pveam update
  pveam download "$TEMPLATE_STORAGE" "$TEMPLATE"
else
  echo "✓ Ubuntu 24.04 template already available"
fi

# Step 2: Create the LXC container
if pct status "$CTID" &>/dev/null; then
  echo "⚠️  Container $CTID already exists. Delete it first or change CTID."
  exit 1
fi

echo ""
echo "🏗️  Creating LXC container $CTID ($HOSTNAME)..."
pct create "$CTID" "${TEMPLATE_STORAGE}:vztmpl/${TEMPLATE}" \
  --hostname "$HOSTNAME" \
  --memory "$MEMORY" \
  --swap "$SWAP" \
  --cores "$CORES" \
  --rootfs "${STORAGE}:${DISK}" \
  --net0 "name=eth0,bridge=${BRIDGE},ip=dhcp" \
  --unprivileged 1 \
  --features nesting=1 \
  --onboot 1 \
  --start 0

echo "✓ Container $CTID created"

# Step 3: Start container
echo ""
echo "🚀 Starting container..."
pct start "$CTID"
sleep 5

# Wait for network
echo "⏳ Waiting for network..."
for i in {1..30}; do
  if pct exec "$CTID" -- ping -c1 -W1 8.8.8.8 &>/dev/null; then
    break
  fi
  sleep 1
done

# Get the IP
CT_IP=$(pct exec "$CTID" -- hostname -I | awk '{print $1}')
echo "✓ Container IP: $CT_IP"

# Step 4: Install everything inside the container
echo ""
echo "📥 Installing Node.js 20, git, and tools..."
pct exec "$CTID" -- bash -c '
  export DEBIAN_FRONTEND=noninteractive

  # Update and install basics
  apt-get update -qq
  apt-get install -y -qq curl git ca-certificates gnupg

  # Node.js 20 via NodeSource
  curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
  apt-get install -y -qq nodejs

  # Verify
  echo "Node: $(node --version)"
  echo "npm: $(npm --version)"
'

# Step 5: Clone repo and install deps
echo ""
echo "📂 Cloning repository..."
pct exec "$CTID" -- bash -c "
  cd /opt
  git clone ${REPO} flatwhiteindex
  cd flatwhiteindex
  npm install --production
  echo '✓ Dependencies installed'
"

# Step 6: Create .env template
echo ""
echo "📝 Creating .env file..."
pct exec "$CTID" -- bash -c '
  cd /opt/flatwhiteindex
  cp env.example .env
  echo "✓ .env created from template — you need to fill in your API keys"
'

# Step 7: Create systemd service for webhook
echo ""
echo "⚙️  Creating systemd services..."
pct exec "$CTID" -- bash -c 'cat > /etc/systemd/system/flatwhite-webhook.service << EOF
[Unit]
Description=Flat White Index — Webhook Receiver
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/opt/flatwhiteindex
ExecStart=/usr/bin/node webhook.js
Restart=on-failure
RestartSec=5
Environment=NODE_ENV=production

# Load env vars from .env
EnvironmentFile=/opt/flatwhiteindex/.env

# Logging
StandardOutput=journal
StandardError=journal
SyslogIdentifier=flatwhite-webhook

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable flatwhite-webhook
echo "✓ flatwhite-webhook.service created and enabled"
'

# Step 8: Create a helper script inside the container
pct exec "$CTID" -- bash -c 'cat > /opt/flatwhiteindex/run.sh << "EOF"
#!/bin/bash
# Helper script for running Flat White Index commands
cd /opt/flatwhiteindex

case "${1:-help}" in
  webhook)
    echo "Starting webhook server..."
    systemctl start flatwhite-webhook
    systemctl status flatwhite-webhook
    ;;
  stop)
    systemctl stop flatwhite-webhook
    echo "Webhook stopped."
    ;;
  status)
    systemctl status flatwhite-webhook
    ;;
  dry-run)
    SUBURB="${2:-sydney_cbd}"
    echo "Dry run for $SUBURB..."
    node index.js --suburb="$SUBURB" --dry-run
    ;;
  call)
    SUBURB="${2:-sydney_cbd}"
    BATCH="${3:-10}"
    echo "⚠️  LIVE CALLS — $SUBURB, batch size $BATCH"
    echo "This will cost money! Press Ctrl+C within 5 seconds to cancel."
    sleep 5
    node index.js --suburb="$SUBURB" --batch-size="$BATCH"
    ;;
  mock)
    node scripts/seed-mock-data.js
    ;;
  test)
    npm test
    ;;
  logs)
    journalctl -u flatwhite-webhook -f
    ;;
  health)
    curl -s http://localhost:3001/health | node -e "process.stdin.on('data',d=>console.log(JSON.stringify(JSON.parse(d),null,2)))"
    ;;
  env)
    nano /opt/flatwhiteindex/.env
    echo "Restarting webhook to pick up changes..."
    systemctl restart flatwhite-webhook
    ;;
  update)
    git pull origin master
    npm install --production
    systemctl restart flatwhite-webhook
    echo "Updated and restarted."
    ;;
  help|*)
    echo "Flat White Index — Commands:"
    echo "  ./run.sh webhook    Start webhook server (systemd)"
    echo "  ./run.sh stop       Stop webhook server"
    echo "  ./run.sh status     Check webhook status"
    echo "  ./run.sh logs       Tail webhook logs"
    echo "  ./run.sh health     Check /health endpoint"
    echo "  ./run.sh dry-run [suburb]       Test cafe fetch (no calls)"
    echo "  ./run.sh call [suburb] [batch]  LIVE calls (costs money!)"
    echo "  ./run.sh mock       Generate mock data"
    echo "  ./run.sh test       Run tests"
    echo "  ./run.sh env        Edit .env and restart"
    echo "  ./run.sh update     Pull latest code and restart"
    echo ""
    echo "Suburbs: sydney_cbd, surry_hills, newtown, glebe, balmain,"
    echo "         paddington, darlinghurst, redfern, chippendale, erskineville"
    ;;
esac
EOF
chmod +x /opt/flatwhiteindex/run.sh
'

# Done!
echo ""
echo "============================================="
echo "☕ Flat White Index — Setup Complete!"
echo "============================================="
echo ""
echo "Container: $CTID ($HOSTNAME)"
echo "IP:        $CT_IP"
echo "SSH:       ssh root@$CT_IP"
echo ""
echo "Next steps:"
echo ""
echo "  1. SSH into the container:"
echo "     pct enter $CTID"
echo ""
echo "  2. Fill in your API keys:"
echo "     cd /opt/flatwhiteindex && nano .env"
echo ""
echo "  3. Set up Supabase:"
echo "     - Create project at supabase.com"
echo "     - Run specs/migrations/001_initial_schema.sql in SQL editor"
echo "     - Copy URL + service key to .env"
echo ""
echo "  4. Start the webhook:"
echo "     ./run.sh webhook"
echo ""
echo "  5. Test with a dry run:"
echo "     ./run.sh dry-run sydney_cbd"
echo ""
echo "  6. For live calls (needs ngrok or Cloudflare Tunnel):"
echo "     - Set WEBHOOK_BASE_URL in .env to your public URL"
echo "     ./run.sh call sydney_cbd 10"
echo ""
echo "  7. View logs:"
echo "     ./run.sh logs"
echo ""
echo "============================================="
