#!/usr/bin/env bash
set -euo pipefail

PROJECT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$PROJECT_DIR"

LOG_DIR="$PROJECT_DIR/.logs"
mkdir -p "$LOG_DIR"
LOG_FILE="$LOG_DIR/validate-$(date '+%Y%m%d-%H%M%S').log"

{
  echo "[INFO] project: $PROJECT_DIR"
  echo "[INFO] started: $(date '+%F %T')"

  echo "[CHECK] git status"
  git status --short || true

  echo "[CHECK] script syntax"
  node -e "new Function(require('fs').readFileSync('script.js','utf8')); console.log('script.js: OK')"

  echo "[CHECK] data json"
  node -e "JSON.parse(require('fs').readFileSync('data.json','utf8')); console.log('data.json: OK')"

  echo "[CHECK] templates integrity (optional)"
  if [ -f scripts/export-category-samples.js ]; then
    node scripts/export-category-samples.js >/dev/null
    echo "templates regenerated."
  else
    echo "templates script not found."
  fi

  echo "[DONE] completed"
} | tee "$LOG_FILE"

echo "[INFO] log: $LOG_FILE"