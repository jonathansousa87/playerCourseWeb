@echo off
title Minha Plataforma - Iniciando...
color 0A

echo =====================================
echo        MINHA PLATAFORMA
echo =====================================
echo.

echo Verificando Node.js...
node --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: Node.js nao encontrado!
    echo Instale Node.js primeiro: https://nodejs.org
    pause
    exit /b 1
)

echo Node.js OK
echo.

echo Verificando NPM...
npm --version >nul 2>&1
if errorlevel 1 (
    echo ERRO: NPM nao encontrado!
    pause
    exit /b 1
)

echo NPM OK
echo.

echo Iniciando servidor backend...
start /b "Servidor Backend" node server.js
if errorlevel 1 (
    echo ERRO: Falha ao iniciar servidor!
    pause
    exit /b 1
)

echo Servidor iniciado!
echo Aguardando inicializacao...
timeout /t 3 /nobreak >nul

echo.
echo Iniciando cliente frontend...
start /b "Cliente Frontend" npm run dev
if errorlevel 1 (
    echo ERRO: Falha ao iniciar cliente!
    pause
    exit /b 1
)

echo Cliente iniciado!
echo.

title Minha Plataforma - Rodando
color 0B

echo =====================================
echo   MINHA PLATAFORMA INICIADA!
echo =====================================
echo  Frontend: http://localhost:5173
echo  Backend:  http://localhost:3001
echo =====================================
echo.
echo Pressione Ctrl+C para parar
echo Ou feche esta janela para manter em background
echo.

:loop
timeout /t 5 /nobreak >nul
goto loop