#!/bin/bash
# ============================================
# SIRHU-RPA - Detener proceso
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/.rpa.pid"

if [ ! -f "$PID_FILE" ]; then
    echo "No hay proceso RPA corriendo (no existe .rpa.pid)"
    exit 0
fi

PID=$(cat "$PID_FILE")

if ps -p "$PID" > /dev/null 2>&1; then
    echo "Deteniendo RPA (PID: $PID)..."
    kill "$PID"
    
    # Esperar a que termine
    for i in {1..10}; do
        if ! ps -p "$PID" > /dev/null 2>&1; then
            break
        fi
        sleep 1
    done
    
    # Forzar si sigue vivo
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "Forzando terminación..."
        kill -9 "$PID"
    fi
    
    rm -f "$PID_FILE"
    echo "RPA detenido"
else
    echo "El proceso $PID ya no existe"
    rm -f "$PID_FILE"
fi
