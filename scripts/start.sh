#!/bin/bash
# ============================================
# SIRHU-RPA - Iniciar proceso en background
# ============================================

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PID_FILE="$PROJECT_DIR/.rpa.pid"
LOG_FILE="$PROJECT_DIR/logs/rpa.log"

cd "$PROJECT_DIR"

# Verificar si ya está corriendo
if [ -f "$PID_FILE" ]; then
    PID=$(cat "$PID_FILE")
    if ps -p "$PID" > /dev/null 2>&1; then
        echo "El RPA ya está corriendo (PID: $PID)"
        echo "Usa ./scripts/stop.sh para detenerlo"
        exit 1
    else
        rm -f "$PID_FILE"
    fi
fi

# Crear carpeta de logs si no existe
mkdir -p logs

echo "Iniciando SIRHU-RPA..."

# Ejecutar en background con nohup
nohup npm run start:siamo >> "$LOG_FILE" 2>&1 &

# Guardar PID
echo $! > "$PID_FILE"

echo "RPA iniciado (PID: $(cat $PID_FILE))"
echo "Logs: $LOG_FILE"
echo "Para detener: ./scripts/stop.sh"
