#!/usr/bin/env bash
# setup.sh - Instalacao completa em Linux / macOS / WSL
# Idempotente: pode rodar varias vezes sem quebrar nada.
#
# Uso: ./setup.sh
#
# O que ele faz:
#   1. Verifica dependencias: Docker, Node.js, npm
#   2. Cria .env a partir de .env.example (se nao existir)
#   3. Pede COURSES_PATH e DEEPSEEK_API_KEY interativamente
#   4. Sobe Postgres via docker compose
#   5. Aguarda Postgres ficar healthy
#   6. npm install
#   7. Aplica schema (migrate.js — idempotente)
#   8. Mostra proximos passos

set -e

# Cores
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
RED='\033[0;31m'
BLUE='\033[0;34m'
NC='\033[0m'

ok()    { printf "${GREEN}[OK]${NC} %s\n" "$1"; }
warn()  { printf "${YELLOW}[!]${NC}  %s\n" "$1"; }
err()   { printf "${RED}[X]${NC}  %s\n" "$1"; }
info()  { printf "${BLUE}[i]${NC}  %s\n" "$1"; }
step()  { printf "\n${BLUE}==>${NC} ${1}\n"; }

# 1. Verificar dependencias
step "1/6  Verificando dependencias"

MISSING=0
if ! command -v node >/dev/null 2>&1; then
  err "Node.js nao encontrado. Instale: https://nodejs.org (>= 18)"
  MISSING=1
else
  ok "Node.js $(node --version)"
fi

if ! command -v npm >/dev/null 2>&1; then
  err "npm nao encontrado."
  MISSING=1
else
  ok "npm $(npm --version)"
fi

# Detecta `docker compose` (v2) ou `docker-compose` (v1)
DC=""
if docker compose version >/dev/null 2>&1; then
  DC="docker compose"
  ok "Docker $(docker --version | awk '{print $3}' | tr -d ',')"
elif command -v docker-compose >/dev/null 2>&1; then
  DC="docker-compose"
  ok "docker-compose $(docker-compose --version | awk '{print $3}' | tr -d ',')"
else
  err "Docker nao encontrado. Instale Docker Desktop ou Docker Engine + Compose v2."
  err "  Linux:  https://docs.docker.com/engine/install/"
  err "  macOS:  https://www.docker.com/products/docker-desktop"
  MISSING=1
fi

if [ "$MISSING" -ne 0 ]; then
  exit 1
fi

# 2. .env
step "2/6  Configurando .env"

if [ -f .env ]; then
  ok ".env ja existe (preservado)"
else
  if [ ! -f .env.example ]; then
    err ".env.example nao encontrado. Voce esta no diretorio certo?"
    exit 1
  fi
  cp .env.example .env
  ok ".env criado a partir de .env.example"

  # Tenta preencher COURSES_PATH interativamente
  printf "\n"
  info "Caminho da pasta dos cursos (onde ficam os videos)."
  info "Ex: /home/usuario/Cursos  ou  /mnt/disco/cursos"
  printf "  COURSES_PATH: "
  read -r COURSES_INPUT
  if [ -n "$COURSES_INPUT" ]; then
    # Escape das / pra sed
    ESCAPED=$(printf '%s\n' "$COURSES_INPUT" | sed 's:[\/&]:\\&:g')
    sed -i.bak "s|^COURSES_PATH=.*|COURSES_PATH=${ESCAPED}|" .env && rm -f .env.bak
    ok "COURSES_PATH definido"
  else
    warn "COURSES_PATH em branco — edite .env depois pra apontar pros cursos"
  fi

  # DeepSeek API key (opcional)
  printf "\n"
  info "DeepSeek API key (opcional — necessaria para chat IA + geracao de conteudo)."
  info "Obtenha em https://platform.deepseek.com/api_keys ou deixe em branco e pule"
  printf "  DEEPSEEK_API_KEY: "
  read -r DS_KEY
  if [ -n "$DS_KEY" ]; then
    ESCAPED=$(printf '%s\n' "$DS_KEY" | sed 's:[\/&]:\\&:g')
    sed -i.bak "s|^DEEPSEEK_API_KEY=.*|DEEPSEEK_API_KEY=${ESCAPED}|" .env && rm -f .env.bak
    ok "DEEPSEEK_API_KEY definido"
  else
    warn "DEEPSEEK_API_KEY em branco — funcionalidades de IA ficam desabilitadas (UI mostra erro claro)"
  fi
fi

# 3. Subir Postgres
step "3/6  Subindo Postgres (docker compose up -d)"
$DC up -d
ok "Containers no ar"

# 4. Aguardar healthy
step "4/6  Aguardando Postgres ficar healthy"
TRIES=0
MAX_TRIES=30
until docker exec playercourse-postgres pg_isready -U playercourse -d playercourse >/dev/null 2>&1; do
  TRIES=$((TRIES + 1))
  if [ "$TRIES" -ge "$MAX_TRIES" ]; then
    err "Postgres nao ficou pronto em $MAX_TRIES tentativas"
    err "Logs do container:"
    $DC logs --tail 30 postgres
    exit 1
  fi
  printf "."
  sleep 1
done
printf "\n"
ok "Postgres healthy (porta 5433)"

# 5. npm install
step "5/6  Instalando dependencias Node (npm install)"
if [ -d node_modules ]; then
  info "node_modules ja existe — rodando npm install pra garantir que esta atualizado"
fi
npm install --silent
ok "Dependencias instaladas"

# 6. Aplicar schema
step "6/6  Aplicando schema (migrate.js — idempotente)"
node db/migrate.js
ok "Schema aplicado"

# Final
printf "\n${GREEN}==================================================${NC}\n"
printf "${GREEN}  Setup completo!${NC}\n"
printf "${GREEN}==================================================${NC}\n\n"

printf "Para iniciar a plataforma:\n\n"
printf "  ${BLUE}./start.sh${NC}              # sobe backend + frontend juntos\n\n"
printf "Ou manualmente em 2 terminais:\n\n"
printf "  ${BLUE}npm run server${NC}          # backend Express (porta 3001)\n"
printf "  ${BLUE}npm run dev${NC}             # frontend Vite (porta 5173)\n\n"

printf "Acesse: ${BLUE}http://localhost:5173${NC}\n\n"

# Aviso sobre COURSES_PATH se nao foi setado
if grep -q '^COURSES_PATH=$' .env 2>/dev/null; then
  warn "COURSES_PATH esta vazio em .env — abra a aba de configuracao na UI ou edite o arquivo"
fi
if grep -q '^DEEPSEEK_API_KEY=$' .env 2>/dev/null; then
  warn "DEEPSEEK_API_KEY esta vazio — para usar chat IA / gerar conteudo, edite .env"
fi
