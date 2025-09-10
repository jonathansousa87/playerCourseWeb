#!/usr/bin/env fish

# Obtém o diretório atual
set current_dir (pwd)

# Inicia o servidor em background
echo "Iniciando servidor..."
node server.js &
set server_pid $last_pid

# Aguarda o servidor inicializar
sleep 3

# Inicia o cliente
echo "Iniciando cliente..."
npm run dev &
set client_pid $last_pid

echo "Servidor PID: $server_pid"
echo "Cliente PID: $client_pid"
echo "Para parar os serviços: kill $server_pid $client_pid"

# Mantém o script rodando
wait
