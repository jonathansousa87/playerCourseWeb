# setup.ps1 - Instalacao completa em Windows (PowerShell)
# Idempotente: pode rodar varias vezes sem quebrar nada.
#
# Uso (PowerShell):
#   .\setup.ps1
#
# Se o Windows reclamar de policy:
#   PowerShell -ExecutionPolicy Bypass -File .\setup.ps1
#
# Pre-requisitos:
#   - Docker Desktop instalado e rodando
#   - Node.js >= 18 (https://nodejs.org)

$ErrorActionPreference = "Stop"

function Write-Ok    { param($m) Write-Host "[OK] $m" -ForegroundColor Green }
function Write-Warn  { param($m) Write-Host "[!]  $m" -ForegroundColor Yellow }
function Write-Err   { param($m) Write-Host "[X]  $m" -ForegroundColor Red }
function Write-Info  { param($m) Write-Host "[i]  $m" -ForegroundColor Cyan }
function Write-Step  { param($m) Write-Host "`n==> $m" -ForegroundColor Cyan }

# 1. Verificar dependencias
Write-Step "1/6  Verificando dependencias"

$missing = $false

try {
    $nodeVer = node --version 2>$null
    Write-Ok "Node.js $nodeVer"
} catch {
    Write-Err "Node.js nao encontrado. Instale: https://nodejs.org (>= 18)"
    $missing = $true
}

try {
    $npmVer = npm --version 2>$null
    Write-Ok "npm $npmVer"
} catch {
    Write-Err "npm nao encontrado."
    $missing = $true
}

# Detecta `docker compose` (v2)
$dockerOk = $false
try {
    docker compose version 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) {
        $dockerVer = (docker --version) -split ' ' | Select-Object -Index 2
        Write-Ok "Docker $($dockerVer -replace ',','')"
        $dockerOk = $true
    }
} catch {}

if (-not $dockerOk) {
    Write-Err "Docker nao encontrado ou Docker Desktop nao esta rodando."
    Write-Err "  Instale: https://www.docker.com/products/docker-desktop"
    Write-Err "  E garanta que Docker Desktop esteja iniciado (icone na bandeja)."
    $missing = $true
}

if ($missing) { exit 1 }

# 2. .env
Write-Step "2/6  Configurando .env"

if (Test-Path ".env") {
    Write-Ok ".env ja existe (preservado)"
} else {
    if (-not (Test-Path ".env.example")) {
        Write-Err ".env.example nao encontrado. Voce esta no diretorio certo?"
        exit 1
    }
    Copy-Item ".env.example" ".env"
    Write-Ok ".env criado a partir de .env.example"

    # COURSES_PATH
    Write-Host ""
    Write-Info "Caminho da pasta dos cursos (onde ficam os videos)."
    Write-Info 'Ex: C:\Users\seu_usuario\Cursos  ou  D:\Cursos'
    $coursesInput = Read-Host "  COURSES_PATH"
    if ($coursesInput) {
        # Normaliza: usa forward-slash ou escapa backslash. Node aceita ambos.
        $coursesNorm = $coursesInput -replace '\\', '/'
        (Get-Content .env) -replace '^COURSES_PATH=.*', "COURSES_PATH=$coursesNorm" | Set-Content .env
        Write-Ok "COURSES_PATH definido"
    } else {
        Write-Warn "COURSES_PATH em branco - edite .env depois"
    }

    # DeepSeek API key
    Write-Host ""
    Write-Info "DeepSeek API key (opcional - chat IA + geracao de conteudo)."
    Write-Info "Obtenha em https://platform.deepseek.com/api_keys ou pule"
    $dsKey = Read-Host "  DEEPSEEK_API_KEY"
    if ($dsKey) {
        (Get-Content .env) -replace '^DEEPSEEK_API_KEY=.*', "DEEPSEEK_API_KEY=$dsKey" | Set-Content .env
        Write-Ok "DEEPSEEK_API_KEY definido"
    } else {
        Write-Warn "DEEPSEEK_API_KEY em branco - funcionalidades de IA desabilitadas"
    }
}

# 3. Subir Postgres
Write-Step "3/6  Subindo Postgres (docker compose up -d)"
docker compose up -d
if ($LASTEXITCODE -ne 0) {
    Write-Err "Falha ao subir containers. Docker Desktop esta rodando?"
    exit 1
}
Write-Ok "Containers no ar"

# 4. Aguardar healthy
Write-Step "4/6  Aguardando Postgres ficar healthy"
$tries = 0
$maxTries = 30
do {
    $tries++
    Start-Sleep -Seconds 1
    docker exec playercourse-postgres pg_isready -U playercourse -d playercourse 2>$null | Out-Null
    if ($LASTEXITCODE -eq 0) { break }
    Write-Host -NoNewline "."
    if ($tries -ge $maxTries) {
        Write-Host ""
        Write-Err "Postgres nao ficou pronto em $maxTries tentativas"
        Write-Err "Logs do container:"
        docker compose logs --tail 30 postgres
        exit 1
    }
} while ($true)
Write-Host ""
Write-Ok "Postgres healthy (porta 5433)"

# 5. npm install
Write-Step "5/6  Instalando dependencias Node (npm install)"
if (Test-Path "node_modules") {
    Write-Info "node_modules ja existe - rodando npm install pra atualizar"
}
npm install --silent
if ($LASTEXITCODE -ne 0) {
    Write-Err "npm install falhou"
    exit 1
}
Write-Ok "Dependencias instaladas"

# 6. Aplicar schema
Write-Step "6/6  Aplicando schema (migrate.js - idempotente)"
node db/migrate.js
if ($LASTEXITCODE -ne 0) {
    Write-Err "Migracao falhou"
    exit 1
}
Write-Ok "Schema aplicado"

# Final
Write-Host ""
Write-Host "==================================================" -ForegroundColor Green
Write-Host "  Setup completo!" -ForegroundColor Green
Write-Host "==================================================" -ForegroundColor Green
Write-Host ""

Write-Host "Para iniciar a plataforma, abra 2 terminais:" -ForegroundColor White
Write-Host ""
Write-Host "  Terminal 1: " -NoNewline
Write-Host "npm run server" -ForegroundColor Cyan
Write-Host "              (backend Express - porta 3001)"
Write-Host ""
Write-Host "  Terminal 2: " -NoNewline
Write-Host "npm run dev" -ForegroundColor Cyan
Write-Host "              (frontend Vite - porta 5173)"
Write-Host ""
Write-Host "Acesse: " -NoNewline
Write-Host "http://localhost:5173" -ForegroundColor Cyan
Write-Host ""

# Avisos finais
$envContent = Get-Content .env -Raw
if ($envContent -match '(?m)^COURSES_PATH=$') {
    Write-Warn "COURSES_PATH esta vazio em .env - configure pela UI ou edite o arquivo"
}
if ($envContent -match '(?m)^DEEPSEEK_API_KEY=$') {
    Write-Warn "DEEPSEEK_API_KEY esta vazio - para usar IA, edite .env"
}
