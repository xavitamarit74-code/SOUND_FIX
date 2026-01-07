#!/usr/bin/env bash
set -euo pipefail

# Start Sound Fix app (dev server with COOP/COEP) and auto-open browser.
# Works on macOS/Linux; on Windows use Git Bash or WSL.

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$SCRIPT_DIR"

if ! command -v node >/dev/null 2>&1; then
  echo "ERROR: Node.js no está instalado o no está en PATH."
  echo "Instala Node.js 18+ y vuelve a ejecutar."
  exit 1
fi

if ! command -v npm >/dev/null 2>&1; then
  echo "ERROR: npm no está disponible (normalmente viene con Node)."
  exit 1
fi

# Install deps only if needed (faster on subsequent runs)
if [ ! -d "node_modules" ]; then
  echo "node_modules no existe. Ejecutando npm install..."
  npm install
fi

echo "Arrancando la aplicación en http://localhost:5173 ..."
# npm start ya incluye 'npm install && npm run dev' en este proyecto,
# pero mantenemos el check anterior para hacerlo más rápido.
exec npm run dev
