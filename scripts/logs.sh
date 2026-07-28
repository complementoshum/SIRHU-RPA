#!/bin/bash
# ============================================
# SIRHU-RPA - Ver logs en tiempo real
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
LOG_FILE="$PROJECT_DIR/logs/rpa.log"

if [ ! -f "$LOG_FILE" ]; then
    echo "No hay logs aún"
    exit 0
fi

echo "Mostrando logs (Ctrl+C para salir)..."
tail -f "$LOG_FILE"
