#!/usr/bin/env bash
set -euo pipefail

# ─── Flat White Index — Deploy Script ───────────────────────────────────────
# Pulls latest from GitHub, installs deps, restarts systemd service.
#
# Usage:
#   ./deploy.sh              # Pull + install + restart webhook
#   ./deploy.sh --caller     # Run a caller batch (pass extra args)
#   ./deploy.sh --dry-run    # Caller dry-run
#   ./deploy.sh --migrate    # Apply pending SQL migrations
#   ./deploy.sh --logs       # Tail webhook logs
#   ./deploy.sh --status     # Service + health status
#   ./deploy.sh --rollback   # Revert to previous version
#   ./deploy.sh --setup      # First-time setup (systemd service + env)

APP_DIR="/opt/flatwhiteindex"
SERVICE="flatwhite-webhook"
BRANCH="${DEPLOY_BRANCH:-master}"

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[0;33m'
CYAN='\033[0;36m'
NC='\033[0m'

log()  { echo -e "${GREEN}[deploy]${NC} $*"; }
warn() { echo -e "${YELLOW}[deploy]${NC} $*"; }
err()  { echo -e "${RED}[deploy]${NC} $*" >&2; }

cd "$APP_DIR"

# ─── Pre-flight ─────────────────────────────────────────────────────────────
preflight() {
  if [ ! -f .env ]; then
    err ".env not found. Run: ./deploy.sh --setup"
    exit 1
  fi

  set -a; source .env; set +a

  local missing=()
  [ -z "${SUPABASE_URL:-}" ]         && missing+=("SUPABASE_URL")
  [ -z "${SUPABASE_SERVICE_KEY:-}" ] && missing+=("SUPABASE_SERVICE_KEY")
  [ -z "${WEBHOOK_BASE_URL:-}" ]     && missing+=("WEBHOOK_BASE_URL")

  if [ "${CALL_PROVIDER:-bland}" = "twilio" ]; then
    [ -z "${TWILIO_ACCOUNT_SID:-}" ]  && missing+=("TWILIO_ACCOUNT_SID")
    [ -z "${TWILIO_AUTH_TOKEN:-}" ]   && missing+=("TWILIO_AUTH_TOKEN")
    [ -z "${TWILIO_PHONE_NUMBER:-}" ] && missing+=("TWILIO_PHONE_NUMBER")
    [ -z "${OPENAI_API_KEY:-}" ]      && missing+=("OPENAI_API_KEY")
  else
    [ -z "${BLAND_AI_API_KEY:-}" ]    && missing+=("BLAND_AI_API_KEY")
  fi

  if [ ${#missing[@]} -gt 0 ]; then
    err "Missing env vars: ${missing[*]}"
    exit 1
  fi
}

# ─── Pull from GitHub ───────────────────────────────────────────────────────
cmd_pull() {
  log "Pulling origin/$BRANCH..."

  git rev-parse HEAD > .last-deploy-sha 2>/dev/null || true

  git fetch origin "$BRANCH"

  local LOCAL REMOTE
  LOCAL=$(git rev-parse HEAD)
  REMOTE=$(git rev-parse "origin/$BRANCH")

  if [ "$LOCAL" = "$REMOTE" ]; then
    log "Already up to date (${LOCAL:0:7})"
    return 1
  fi

  git merge --ff-only "origin/$BRANCH" || {
    err "Branch has diverged. Fix manually: git pull origin $BRANCH"
    exit 1
  }

  log "Updated ${LOCAL:0:7} -> ${REMOTE:0:7}:"
  git log --oneline "$LOCAL..$REMOTE" | sed 's/^/  /'
  return 0
}

# ─── Deploy ─────────────────────────────────────────────────────────────────
cmd_deploy() {
  preflight

  local changed=false
  if cmd_pull; then
    changed=true
  fi

  if [ "$changed" = true ]; then
    log "Installing dependencies..."
    npm ci --omit=dev

    log "Restarting $SERVICE..."
    systemctl restart "$SERVICE"

    sleep 2
    cmd_health
  else
    if ! systemctl is-active --quiet "$SERVICE"; then
      log "Service not running — starting..."
      systemctl start "$SERVICE"
      sleep 2
      cmd_health
    else
      log "Nothing to do. $SERVICE already running."
    fi
  fi
}

# ─── Rollback ───────────────────────────────────────────────────────────────
cmd_rollback() {
  if [ ! -f .last-deploy-sha ]; then
    err "No rollback SHA found"
    exit 1
  fi

  local SHA
  SHA=$(cat .last-deploy-sha)
  log "Rolling back to ${SHA:0:7}..."

  git reset --hard "$SHA"
  npm ci --omit=dev
  systemctl restart "$SERVICE"

  sleep 2
  cmd_health
  log "Rolled back to ${SHA:0:7}"
}

# ─── Caller ─────────────────────────────────────────────────────────────────
cmd_caller() {
  preflight
  set -a; source .env; set +a
  log "Running: node index.js $*"
  node index.js "$@"
}

# ─── Migrate ────────────────────────────────────────────────────────────────
cmd_migrate() {
  preflight
  set -a; source .env; set +a

  log "Applying SQL migrations..."
  for f in specs/migrations/*.sql; do
    log "  $(basename "$f")"
    if command -v psql &>/dev/null && [ -n "${DATABASE_URL:-}" ]; then
      psql "$DATABASE_URL" -f "$f"
    else
      warn "  No psql — apply in Supabase SQL Editor: $f"
    fi
  done
}

# ─── Observability ──────────────────────────────────────────────────────────
cmd_logs() {
  journalctl -u "$SERVICE" -f --no-hostname -n 100
}

cmd_health() {
  local port
  set -a; source .env 2>/dev/null; set +a
  port="${PORT:-3001}"
  local response
  if response=$(curl -sf "http://localhost:$port/health" 2>/dev/null); then
    echo -e "${GREEN}Healthy${NC}: $response"
  else
    err "Health check failed on :$port"
    systemctl status "$SERVICE" --no-pager -l | tail -10
    exit 1
  fi
}

cmd_status() {
  echo -e "${CYAN}=== Flat White Index ===${NC}"
  echo "Branch: $(git branch --show-current) @ $(git rev-parse --short HEAD)"
  echo "Previous: $(cat .last-deploy-sha 2>/dev/null | head -c 7 || echo 'none')"
  echo ""
  systemctl status "$SERVICE" --no-pager | head -15
  echo ""
  cmd_health 2>/dev/null || warn "Not responding"
}

cmd_stop() {
  log "Stopping $SERVICE..."
  systemctl stop "$SERVICE"
  log "Stopped"
}

# ─── First-time setup ──────────────────────────────────────────────────────
cmd_setup() {
  log "First-time setup..."

  # Install deps
  log "Installing dependencies..."
  npm ci

  # Create .env
  if [ ! -f .env ]; then
    cp env.example .env
    log "Created .env — edit it now:"
    log "  nano $APP_DIR/.env"
  else
    log ".env already exists"
  fi

  # Create systemd service
  local SERVICE_FILE="/etc/systemd/system/${SERVICE}.service"
  if [ ! -f "$SERVICE_FILE" ]; then
    cat > "$SERVICE_FILE" << EOF
[Unit]
Description=Flat White Index — Webhook Server
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=$APP_DIR/.env
ExecStart=/usr/bin/node $APP_DIR/webhook.js
Restart=on-failure
RestartSec=5
StandardOutput=journal
StandardError=journal

[Install]
WantedBy=multi-user.target
EOF
    systemctl daemon-reload
    systemctl enable "$SERVICE"
    log "Created and enabled $SERVICE_FILE"
  else
    log "Service file already exists"
  fi

  echo ""
  log "Setup complete. Next steps:"
  log "  1. nano $APP_DIR/.env          # fill in API keys"
  log "  2. ./deploy.sh --migrate       # apply DB schema"
  log "  3. ./deploy.sh                 # start service"
  log "  4. ./deploy.sh --dry-run       # test the pipeline"
}

# ─── Router ─────────────────────────────────────────────────────────────────
case "${1:-}" in
  --caller)   shift; cmd_caller "$@" ;;
  --dry-run)  cmd_caller --suburb="${2:-sydney_cbd}" --dry-run ;;
  --migrate)  cmd_migrate ;;
  --logs)     cmd_logs ;;
  --status)   cmd_status ;;
  --health)   cmd_health ;;
  --stop)     cmd_stop ;;
  --rollback) cmd_rollback ;;
  --setup)    cmd_setup ;;
  --help|-h)
    echo "Usage: ./deploy.sh [command]"
    echo ""
    echo "  (none)        Pull from GitHub + npm ci + restart service"
    echo "  --setup       First-time: create .env, systemd service, npm ci"
    echo "  --caller ...  Run caller with args"
    echo "  --dry-run     Caller dry-run"
    echo "  --migrate     Apply SQL migrations"
    echo "  --logs        journalctl -f"
    echo "  --status      Git SHA + service + health"
    echo "  --health      Quick health check"
    echo "  --stop        Stop service"
    echo "  --rollback    Revert to previous deploy"
    echo ""
    echo "Examples:"
    echo "  ./deploy.sh --setup"
    echo "  ./deploy.sh --caller --suburb=newtown --batch-size=5"
    echo "  ./deploy.sh --rollback"
    ;;
  *) cmd_deploy ;;
esac
