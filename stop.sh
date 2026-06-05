#!/usr/bin/env bash
# Encerra o backend (node server.js, porta 3001) e o frontend (Vite, 5173).
echo "Encerrando backend (3001) e frontend (5173)..."

for port in 3001 5173; do
  if command -v lsof >/dev/null 2>&1; then
    pids=$(lsof -ti tcp:"$port" 2>/dev/null)
    if [ -n "$pids" ]; then
      echo " - porta $port: matando $pids"
      kill $pids 2>/dev/null || true
    fi
  fi
done

# Fallback por nome de processo (caso lsof nao exista ou algo tenha escapado)
pkill -f "node server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

echo "Pronto. Servicos encerrados."
