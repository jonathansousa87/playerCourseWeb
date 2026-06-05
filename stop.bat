@echo off
setlocal enabledelayedexpansion
title Encerrar servicos - Player Course Web
echo Encerrando backend (porta 3001) e frontend (porta 5173)...
echo.

REM netstat lista cada porta 2x (IPv4 0.0.0.0:porta e IPv6 [::]:porta) com o
REM MESMO PID -> dedupamos via seen_<pid>. A saida do taskkill e suprimida de
REM proposito: um PID pode sumir sozinho entre o netstat e o taskkill (ex.: o
REM Vite, filho do npm, encerra junto), gerando um "processo nao encontrado"
REM inofensivo. A verificacao final das portas abaixo e a FONTE DA VERDADE -
REM ela pega tambem o caso real de taskkill negado (porta segue ocupada).
for %%P in (3001 5173) do (
  set "FOUND="
  for /f "tokens=5" %%a in ('netstat -ano ^| findstr ":%%P" ^| findstr LISTENING') do (
    set "FOUND=1"
    if not defined seen_%%a (
      set "seen_%%a=1"
      echo  - porta %%P: encerrando PID %%a
      taskkill /PID %%a /F >nul 2>&1
    )
  )
  if not defined FOUND echo  - porta %%P: nada escutando
)

echo.
echo Verificando se as portas ficaram realmente livres...
set "FAIL=0"
for %%P in (3001 5173) do (
  netstat -ano | findstr ":%%P" | findstr LISTENING >nul
  if not errorlevel 1 (
    echo  [ERRO] porta %%P AINDA esta ocupada - encerramento NAO concluido.
    set "FAIL=1"
  ) else (
    echo  [OK]   porta %%P livre.
  )
)

echo.
if "!FAIL!"=="1" (
  echo ***************************************************************
  echo  ATENCAO: uma porta seguiu ocupada. Causa comum: o servidor foi
  echo  iniciado como Administrador e este stop.bat rodou sem admin
  echo  ^(ou vice-versa^). Rode os dois com a MESMA elevacao.
  echo  So apos [OK] nas duas portas rode o startt.bat.
  echo ***************************************************************
) else (
  echo Pronto. Servicos encerrados e portas 3001/5173 livres.
)
pause
