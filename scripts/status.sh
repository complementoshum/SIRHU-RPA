#!/bin/bash
# ============================================
# SIRHU-RPA - Ver estado del proceso
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/.rpa.pid"
LOG_FILE="$PROJECT_DIR/logs/rpa.log"

if [ ! -f "$PID_FILE" ]; then
    echo "Estado: DETENIDO"
    exit 0
fi

PID=$(cat "$PID_FILE")

if ps -p "$PID" > /dev/null 2>&1; then
    echo "Estado: CORRIENDO (PID: $PID)"
    echo ""
    echo "=== Últimas 10 líneas del log ==="
    tail -n 10 "$LOG_FILE" 2>/dev/null || echo "(sin logs)"
else
    echo "Estado: DETENIDO (proceso $PID ya no existe)"
    rm -f "$PID_FILE"
fi
