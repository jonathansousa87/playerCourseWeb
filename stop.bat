@echo off
title Encerrar servicos - Player Course Web
echo Encerrando backend (porta 3001) e frontend (porta 5173)...
echo.

for %%P in (3001 5173) do (
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P" ^| findstr LISTENING') do (
    echo  - porta %%P: matando PID %%a
    taskkill /PID %%a /F >nul 2>&1
  )
)

echo.
echo Pronto. Servicos encerrados.
pause
