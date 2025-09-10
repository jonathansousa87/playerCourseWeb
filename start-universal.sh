#!/bin/bash

# Script universal compatível com Bash (Linux/Mac/WSL)
set -e

echo "====================================="
echo "       MINHA PLATAFORMA"
echo "====================================="
echo

# Verificar Node.js
if ! command -v node &> /dev/null; then
    echo "ERRO: Node.js não encontrado!"
    echo "Instale Node.js primeiro: https://nodejs.org"
    exit 1
fi

echo "Node.js encontrado: $(node --version)"

# Verificar NPM
if ! command -v npm &> /dev/null; then
    echo "ERRO: NPM não encontrado!"
    exit 1
fi

echo "NPM encontrado: $(npm --version)"
echo

echo "Iniciando servidor backend..."
node server.js &
SERVER_PID=$!

echo "Servidor iniciado (PID: $SERVER_PID)"
echo "Aguardando servidor inicializar..."
sleep 3

echo
echo "Iniciando cliente frontend..."
npm run dev &
CLIENT_PID=$!

echo "Cliente iniciado (PID: $CLIENT_PID)"
echo

echo "====================================="
echo "  MINHA PLATAFORMA INICIADA!"
echo "====================================="
echo " Frontend: http://localhost:5173"
echo " Backend:  http://localhost:3001"
echo "====================================="
echo
echo "PIDs: Servidor($SERVER_PID) Cliente($CLIENT_PID)"
echo "Para parar: kill $SERVER_PID $CLIENT_PID"
echo "Ou pressione Ctrl+C"
echo

# Função de limpeza ao sair
cleanup() {
    echo
    echo "Parando serviços..."
    kill $SERVER_PID $CLIENT_PID 2>/dev/null || true
    wait 2>/dev/null || true
    echo "Serviços parados."
    exit 0
}

# Capturar Ctrl+C
trap cleanup SIGINT SIGTERM

# Manter script rodando
wait