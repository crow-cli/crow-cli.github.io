#!/usr/bin/env bash
# Crow ADE — one-line installer for Linux.
# Installs uv, then crow-cli, then Crow ADE desktop (SideX .deb).
set -euo pipefail

BOLD='\033[1m'
GREEN='\033[0;32m'
CYAN='\033[0;36m'
DIM='\033[2m'
RED='\033[0;31m'
RESET='\033[0m'

info()  { printf "${CYAN}  →${RESET} %s\n" "$*"; }
ok()    { printf "${GREEN}  ✓${RESET} %s\n" "$*"; }
fail()  { printf "${RED}  ✗${RESET} %s\n" "$*" >&2; exit 1; }
header(){ printf "\n${BOLD}${CYAN}🪶 %s${RESET}\n\n" "$*"; }

# ── OS check ────────────────────────────────────────────────────────────────

header "Crow ADE Installer"

case "$(uname -s)" in
  Linux*)  os=linux ;;
  Darwin*) fail "macOS builds are not yet available. Linux only for now." ;;
  *)       fail "Unsupported OS: $(uname -s). Linux only." ;;
esac

arch=$(uname -m)
case "$arch" in
  x86_64|amd64) arch=amd64 ;;
  aarch64|arm64) arch=arm64 ;;
  *) fail "Unsupported architecture: $arch" ;;
esac

info "System: ${os}/${arch}"

# ── Step 1: uv ───────────────────────────────────────────────────────────────

header "Step 1/3: uv (Python package manager)"

if command -v uv &>/dev/null; then
  ok "uv already installed ($(uv --version 2>/dev/null || echo 'present'))"
else
  info "Installing uv..."
  curl -LsSf https://astral.sh/uv/install.sh | sh
  # The installer puts uv in ~/.local/bin
  export PATH="$HOME/.local/bin:$PATH"
  command -v uv &>/dev/null || fail "uv installation failed. Try adding ~/.local/bin to your PATH."
  ok "uv installed"
fi

# ── Step 2: crow-cli ─────────────────────────────────────────────────────────

header "Step 2/3: crow-cli"

if uv tool list 2>/dev/null | grep -q '^crow-cli'; then
  ok "crow-cli already installed"
  info "Updating..."
  uv tool upgrade crow-cli || ok "Already up to date"
else
  info "Installing crow-cli..."
  uv tool install crow-cli --python 3.14
  ok "crow-cli installed"
fi

# Ensure crow-cli is on PATH
export PATH="$HOME/.local/bin:$PATH"
command -v crow-cli &>/dev/null || {
  # uv tool installs go to ~/.local/bin
  if [ -x "$HOME/.local/bin/crow-cli" ]; then
    export PATH="$HOME/.local/bin:$PATH"
  else
    fail "crow-cli not found on PATH. Try: export PATH=\"\$HOME/.local/bin:\$PATH\""
  fi
}

# ── Step 3: Crow ADE desktop ─────────────────────────────────────────────────

header "Step 3/3: Crow ADE desktop (SideX)"

info "This will download and install the .deb package."
info "You may be prompted for your sudo password."
echo ""

crow-cli install desktop

# ── Done ─────────────────────────────────────────────────────────────────────

header "Done!"

printf "  ${DIM}Launch Crow ADE from your applications menu,${RESET}\n"
printf "  ${DIM}or run ${CYAN}crow${RESET}${DIM} from a terminal.${RESET}\n\n"
printf "  ${DIM}Bring your own API keys. Set them in the editor's settings.${RESET}\n\n"
