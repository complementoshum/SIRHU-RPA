#!/bin/bash
# ============================================
# SIRHU-RPA - Script de instalación
# ============================================

set -e

echo "=== Instalando dependencias de Node.js ==="
npm install

echo "=== Compilando TypeScript ==="
npm run build

echo "=== Instalando Playwright Chromium ==="
npx playwright install chromium
npx playwright install-deps chromium

echo "=== Instalación completada ==="
echo "Ejecuta: ./scripts/start.sh para iniciar el RPA"
