#!/bin/bash

# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
#  🌍 AURA Air Quality Platform — Mac One-Click Launcher
#  Double-click this file in Finder to launch the full project.
#  Optimised for macOS (Intel & Apple Silicon).
# ━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

set -e  # Exit on error during setup phases

# ── Colours ────────────────────────────────────────────────────
RESET="\033[0m"
BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RED="\033[31m"
DIM="\033[2m"
MAGENTA="\033[35m"

# ── Helpers ─────────────────────────────────────────────────────
step()    { echo -e "  ${CYAN}▶${RESET}  $1"; }
ok()      { echo -e "  ${GREEN}✔${RESET}  $1"; }
warn()    { echo -e "  ${YELLOW}⚠${RESET}  $1"; }
fail()    { echo -e "  ${RED}✖${RESET}  $1"; }
divider() { echo -e "  ${DIM}─────────────────────────────────────────────────${RESET}"; }

# ── Resolve project root ────────────────────────────────────────
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
cd "$SCRIPT_DIR"

# ── Fix PATH for macOS Finder double-click ──────────────────────
export PATH="/opt/homebrew/bin:/opt/homebrew/sbin:/usr/local/bin:$HOME/.volta/bin:/usr/bin:/bin:/usr/sbin:/sbin:$PATH"
# nvm
if [ -d "$HOME/.nvm/versions/node" ]; then
  NVM_NODE=$(ls "$HOME/.nvm/versions/node" 2>/dev/null | sort -V | tail -1)
  [ -n "$NVM_NODE" ] && export PATH="$HOME/.nvm/versions/node/$NVM_NODE/bin:$PATH"
fi
# fnm
if [ -d "$HOME/Library/Application Support/fnm/node-versions" ]; then
  FNM_NODE=$(ls "$HOME/Library/Application Support/fnm/node-versions" 2>/dev/null | sort -V | tail -1)
  [ -n "$FNM_NODE" ] && export PATH="$HOME/Library/Application Support/fnm/node-versions/$FNM_NODE/installation/bin:$PATH"
fi

# ══════════════════════════════════════════════════════════════════
#  GLOBAL STATE
# ══════════════════════════════════════════════════════════════════
PID_FRONTEND=""
PID_BACKEND=""
LOG_FRONTEND="/tmp/aura_frontend_$$.log"
LOG_BACKEND="/tmp/aura_backend_$$.log"

cleanup() {
  echo ""
  step "Shutting down servers..."
  [ -n "$PID_FRONTEND" ] && kill "$PID_FRONTEND" 2>/dev/null
  [ -n "$PID_BACKEND" ]  && kill "$PID_BACKEND"  2>/dev/null
  lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
  lsof -ti:5001 2>/dev/null | xargs kill -9 2>/dev/null
  rm -f "$LOG_FRONTEND" "$LOG_BACKEND"
  ok "All servers stopped. Goodbye! 👋"
  echo ""
}
trap cleanup INT TERM EXIT

# Turn off exit-on-error for the rest (servers run in background)
set +e

# ══════════════════════════════════════════════════════════════════
#  HEADER
# ══════════════════════════════════════════════════════════════════
clear
echo ""
echo -e "${CYAN}${BOLD}  ╔══════════════════════════════════════════════════╗${RESET}"
echo -e "${CYAN}${BOLD}  ║                                                  ║${RESET}"
echo -e "${CYAN}${BOLD}  ║   🌍  AURA Air Quality Platform                  ║${RESET}"
echo -e "${CYAN}${BOLD}  ║   ${DIM}Mac Edition — One Click Launch${CYAN}${BOLD}                ║${RESET}"
echo -e "${CYAN}${BOLD}  ║                                                  ║${RESET}"
echo -e "${CYAN}${BOLD}  ╚══════════════════════════════════════════════════╝${RESET}"
echo ""

# ══════════════════════════════════════════════════════════════════
#  1. PREREQUISITES
# ══════════════════════════════════════════════════════════════════
step "Checking prerequisites..."

if ! command -v node &>/dev/null; then
  fail "Node.js not found!  →  brew install node"
  read -n1 -r -p "  Press any key to close..." _; echo ""; exit 1
fi
if ! command -v npm &>/dev/null; then
  fail "npm not found!  →  brew install node"
  read -n1 -r -p "  Press any key to close..." _; echo ""; exit 1
fi

ok "Node $(node -v)  •  npm v$(npm -v)"

ARCH=$(uname -m)
[ "$ARCH" = "arm64" ] && ok "Apple Silicon (arm64)" || ok "Intel ($ARCH)"

PYTHON_CMD=""
command -v python3 &>/dev/null && PYTHON_CMD="python3"
[ -z "$PYTHON_CMD" ] && command -v python &>/dev/null && PYTHON_CMD="python"
[ -n "$PYTHON_CMD" ] && ok "$($PYTHON_CMD --version 2>&1) (ML backend)" || warn "Python not found — ML backend will be skipped"

divider

# ══════════════════════════════════════════════════════════════════
#  2. CLEAR PORTS
# ══════════════════════════════════════════════════════════════════
step "Clearing ports 3000 & 5001..."
lsof -ti:3000 2>/dev/null | xargs kill -9 2>/dev/null
lsof -ti:5001 2>/dev/null | xargs kill -9 2>/dev/null
ok "Ports ready"
sleep 0.5
divider

# ══════════════════════════════════════════════════════════════════
#  3. FIX macOS QUARANTINE + PERMISSIONS
# ══════════════════════════════════════════════════════════════════
if [ -d "$SCRIPT_DIR/frontend/node_modules" ]; then
  xattr -rd com.apple.quarantine "$SCRIPT_DIR/frontend/node_modules" 2>/dev/null
  chmod +x "$SCRIPT_DIR/frontend/node_modules/.bin/"* 2>/dev/null
fi

# ══════════════════════════════════════════════════════════════════
#  4. FRONTEND DEPENDENCIES
# ══════════════════════════════════════════════════════════════════
if [ ! -d "$SCRIPT_DIR/frontend/node_modules" ] || [ ! -f "$SCRIPT_DIR/frontend/node_modules/.package-lock.json" ]; then
  step "Installing frontend dependencies..."
  (cd "$SCRIPT_DIR/frontend" && npm install) 2>&1
  if [ $? -ne 0 ]; then
    fail "npm install failed! Try: cd frontend && npm install"
    read -n1 -r -p "  Press any key to close..." _; echo ""; exit 1
  fi
  # Fix permissions after fresh install
  chmod +x "$SCRIPT_DIR/frontend/node_modules/.bin/"* 2>/dev/null
  xattr -rd com.apple.quarantine "$SCRIPT_DIR/frontend/node_modules" 2>/dev/null
  ok "Frontend dependencies installed"
else
  ok "Frontend dependencies ready"
fi
divider

# ══════════════════════════════════════════════════════════════════
#  5. BACKEND DEPENDENCIES (quick check, no long pip installs at launch)
# ══════════════════════════════════════════════════════════════════
BACKEND_READY=false

if [ -n "$PYTHON_CMD" ] && [ -f "$SCRIPT_DIR/backend/predict.py" ]; then

  # Create venv once if needed
  if [ ! -d "$SCRIPT_DIR/backend/venv" ]; then
    step "Creating Python venv (one-time setup)..."
    $PYTHON_CMD -m venv "$SCRIPT_DIR/backend/venv" 2>/dev/null && ok "Venv created" || warn "Venv creation failed"
  fi

  if [ -f "$SCRIPT_DIR/backend/venv/bin/activate" ]; then
    # Check if flask is importable (quick marker that deps are installed)
    if "$SCRIPT_DIR/backend/venv/bin/python" -c "import flask" 2>/dev/null; then
      ok "Backend dependencies ready"
      BACKEND_READY=true
    else
      step "Installing backend dependencies (this may take 1-2 min on first run)..."
      source "$SCRIPT_DIR/backend/venv/bin/activate"
      pip install -r "$SCRIPT_DIR/backend/requirements.txt" 2>&1 | while IFS= read -r line; do
        # Show progress dots instead of full pip output
        printf "·"
      done
      echo ""
      deactivate 2>/dev/null
      # Verify it worked
      if "$SCRIPT_DIR/backend/venv/bin/python" -c "import flask" 2>/dev/null; then
        ok "Backend dependencies installed"
        BACKEND_READY=true
      else
        warn "Some backend deps may have failed — backend might not start"
        BACKEND_READY=true  # try anyway
      fi
    fi
  else
    # No venv, try system python
    if $PYTHON_CMD -c "import flask" 2>/dev/null; then
      ok "Using system Python (flask found)"
      BACKEND_READY=true
    else
      warn "Flask not installed — run: pip3 install flask flask-cors scikit-learn numpy pandas"
    fi
  fi
  divider
fi

# ══════════════════════════════════════════════════════════════════
#  6. LAUNCH SERVERS
# ══════════════════════════════════════════════════════════════════
echo ""
step "Starting Frontend (React/Vite)  →  ${BOLD}http://localhost:3000${RESET}"
(cd "$SCRIPT_DIR/frontend" && npm run dev -- --port 3000 --host 0.0.0.0) >"$LOG_FRONTEND" 2>&1 &
PID_FRONTEND=$!

if $BACKEND_READY; then
  step "Starting Backend (Flask/ML)    →  ${BOLD}http://localhost:5001${RESET}"
  if [ -f "$SCRIPT_DIR/backend/venv/bin/activate" ]; then
    (source "$SCRIPT_DIR/backend/venv/bin/activate" && cd "$SCRIPT_DIR/backend" && $PYTHON_CMD predict.py) >"$LOG_BACKEND" 2>&1 &
  else
    (cd "$SCRIPT_DIR/backend" && $PYTHON_CMD predict.py) >"$LOG_BACKEND" 2>&1 &
  fi
  PID_BACKEND=$!
else
  warn "Skipping ML backend"
fi

divider

# ══════════════════════════════════════════════════════════════════
#  7. WAIT FOR PORTS
# ══════════════════════════════════════════════════════════════════
wait_for_port() {
  local port=$1 label=$2 logfile=$3
  local max=60 count=0

  printf "  ${CYAN}⏳${RESET}  Waiting for %s " "$label"
  while ! nc -z 127.0.0.1 "$port" 2>/dev/null; do
    sleep 0.5
    count=$((count + 1))
    printf "·"
    if [ $count -ge $max ]; then
      echo ""
      fail "${label} did not start in time!"
      echo -e "  ${DIM}$(tail -15 "$logfile" 2>/dev/null)${RESET}"
      echo ""
      read -n1 -r -p "  Press any key to close..." _; echo ""
      exit 1
    fi
  done
  echo ""
  ok "${label} is ready!"
}

wait_for_port 3000 "Frontend (port 3000)" "$LOG_FRONTEND"
[ -n "$PID_BACKEND" ] && wait_for_port 5001 "ML Backend (port 5001)" "$LOG_BACKEND"

divider

# ══════════════════════════════════════════════════════════════════
#  8. OPEN BROWSER
# ══════════════════════════════════════════════════════════════════
step "Opening browser..."
open "http://localhost:3000"
divider

# ══════════════════════════════════════════════════════════════════
#  SUCCESS BANNER
# ══════════════════════════════════════════════════════════════════
echo ""
echo -e "${GREEN}${BOLD}  ┌──────────────────────────────────────────────────┐${RESET}"
echo -e "${GREEN}${BOLD}  │            ✅  AURA is running!                  │${RESET}"
echo -e "${GREEN}${BOLD}  └──────────────────────────────────────────────────┘${RESET}"
echo ""
echo -e "  ${CYAN}Web App     ${RESET}  →  ${BOLD}http://localhost:3000${RESET}"
[ -n "$PID_BACKEND" ] && echo -e "  ${CYAN}ML Backend  ${RESET}  →  ${BOLD}http://localhost:5001${RESET}"
echo -e "  ${CYAN}Dashboard   ${RESET}  →  ${BOLD}http://localhost:3000/dashboard${RESET}"
echo -e "  ${CYAN}Map         ${RESET}  →  ${BOLD}http://localhost:3000/map${RESET}"
echo -e "  ${CYAN}Analytics   ${RESET}  →  ${BOLD}http://localhost:3000/analytics${RESET}"
echo ""
echo -e "  ${DIM}Admin Login:${RESET}"
echo -e "  ${DIM}  Email    →  admin@aura.ai${RESET}"
echo -e "  ${DIM}  Password →  AuraAdmin2024${RESET}"
echo ""
echo -e "  ${MAGENTA}${BOLD}  Press Ctrl+C to stop all servers.${RESET}"
divider
echo ""

# ══════════════════════════════════════════════════════════════════
#  9. WATCHDOG — monitor child processes
# ══════════════════════════════════════════════════════════════════
while true; do
  if ! kill -0 "$PID_FRONTEND" 2>/dev/null; then
    fail "Frontend stopped! Log:"
    tail -15 "$LOG_FRONTEND" 2>/dev/null
    break
  fi
  if [ -n "$PID_BACKEND" ] && ! kill -0 "$PID_BACKEND" 2>/dev/null; then
    warn "ML Backend stopped (frontend still running)"
    tail -10 "$LOG_BACKEND" 2>/dev/null
    PID_BACKEND=""  # Stop checking, frontend can work alone
  fi
  sleep 3
done

echo ""
warn "Server stopped. Press Enter to close."
read -r _
