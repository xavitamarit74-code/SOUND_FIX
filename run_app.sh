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

is_port_in_use() {
  local port="$1"
  lsof -nP -iTCP:"$port" -sTCP:LISTEN >/dev/null 2>&1
}

pick_free_port() {
  local start_port="$1"
  local max_tries=50
  local p="$start_port"

  for _ in $(seq 0 "$max_tries"); do
    if ! is_port_in_use "$p"; then
      echo "$p"
      return 0
    fi
    p=$((p + 1))
  done

  return 1
}

START_PORT="${PORT:-5173}"

if is_port_in_use "$START_PORT"; then
  echo "El puerto $START_PORT ya está en uso. Buscando un puerto libre..."
  echo "Proceso actual en $START_PORT:"
  lsof -nP -iTCP:"$START_PORT" -sTCP:LISTEN | head -n 5 || true
fi

PORT_TO_USE="$(pick_free_port "$START_PORT")" || {
  echo "ERROR: No se encontró un puerto libre empezando en $START_PORT."
  echo "Sugerencia: cierra el proceso que ocupa el puerto o define PORT=xxxx."
  exit 1
}

echo "Arrancando la aplicación en http://localhost:${PORT_TO_USE} ..."
# npm start ya incluye 'npm install && npm run dev' en este proyecto,
# pero mantenemos el check anterior para hacerlo más rápido.
exec env PORT="$PORT_TO_USE" npm run dev
