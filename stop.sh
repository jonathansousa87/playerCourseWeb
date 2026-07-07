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

# Fallback por nome de processo (caso lsof nao exista ou algo tenha escapado).
# O SIGTERM no node dispara o shutdown handler do server.js, que derruba os
# llama-server (VL/Qwen) e o Kokoro graciosamente.
pkill -f "node server.js" 2>/dev/null || true
pkill -f "vite" 2>/dev/null || true

# Da um respiro pro shutdown handler do node derrubar os modelos.
sleep 2

# Rede de seguranca: se algum llama-server do backend (Qwen 8080 / VL 8081)
# escapou (node morto com -9, ou spawnado detached), mata pela porta. Sem isso
# ele fica ORFAO segurando ~10GB de RAM (GGUF mmap + buffers do CUDA) e a VRAM,
# e o processamento seguinte nao cabe na GPU (PaddleOCR cai pra CPU).
for _ in 1 2; do
  if pgrep -f 'llama-server.*port 808[01]' >/dev/null 2>&1; then
    echo " - llama-server orfao (8080/8081): derrubando"
    pkill -TERM -f 'llama-server.*port 808[01]' 2>/dev/null || true
    sleep 2
    pkill -KILL -f 'llama-server.*port 808[01]' 2>/dev/null || true
  fi
done

# Kokoro (TTS) roda em container docker — derruba pra liberar a VRAM tambem.
if command -v docker >/dev/null 2>&1; then
  docker stop kokoro-container >/dev/null 2>&1 || true
fi

echo "Pronto. Servicos encerrados (backend, frontend, modelos)."
